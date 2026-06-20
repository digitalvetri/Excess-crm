import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { can } from '@excess/shared';
import { env } from '@excess/config';

const s3 = new S3Client({ region: env.AWS_REGION });
const S3_BUCKET = env.S3_BUCKET_ASSETS;

// Canonical CSV columns we can map to Lead fields
export const LEAD_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'email', label: 'Email' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'pincode', label: 'Pincode' },
  { key: 'utmSource', label: 'UTM Source' },
  { key: 'utmMedium', label: 'UTM Medium' },
  { key: 'utmCampaign', label: 'UTM Campaign' },
] as const;

export const csvImportRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 MB
  });

  // GET /leads/import/fields — return mappable lead fields
  app.get('/fields', async (req, reply) => {
    if (!can(req.auth.role, 'leads.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    return reply.send({ data: LEAD_FIELDS });
  });

  // POST /leads/import — upload CSV, parse preview, create CsvImport record
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'leads.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No file uploaded' } });
    }
    if (!data.filename.endsWith('.csv') && data.mimetype !== 'text/csv' && data.mimetype !== 'text/plain') {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Only CSV files are accepted' } });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const csvBuffer = Buffer.concat(chunks);
    const csvText = csvBuffer.toString('utf-8');

    // Parse first 6 lines for preview
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'CSV must have at least a header and one data row' } });
    }

    const headers = parseCSVLine(lines[0]!);
    const preview = lines.slice(1, 6).map((line) => parseCSVLine(line));
    const totalRows = lines.length - 1;

    // Create CsvImport record in PENDING state
    const csvImport = await req.withTenant((tx) =>
      tx.csvImport.create({
        data: {
          tenantId: req.auth.tenantId,
          userId: req.auth.userId,
          filename: data.filename,
          s3Key: '', // filled after S3 upload below
          fieldMap: {},
          totalRows,
          status: 'PENDING',
        },
        select: { id: true, filename: true, totalRows: true, status: true, createdAt: true },
      }),
    );

    // Upload CSV to S3
    const s3Key = `csv-imports/${req.auth.tenantId}/${csvImport.id}.csv`;
    try {
      await s3.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: csvBuffer,
        ContentType: 'text/csv',
      }));
    } catch (err) {
      req.log.warn({ err, importId: csvImport.id }, 'csv_import.s3_upload_failed');
      // In dev without S3, store CSV in Redis temporarily
      await app.redis.setex(`csv:${csvImport.id}`, 3600, csvText);
    }

    // Update s3Key on record
    await req.withTenant((tx) =>
      tx.csvImport.update({
        where: { id: csvImport.id },
        data: { s3Key },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, importId: csvImport.id, totalRows }, 'csv_import.created');

    return reply.code(201).send({
      data: {
        importId: csvImport.id,
        filename: data.filename,
        totalRows,
        headers,
        preview,
      },
    });
  });

  // POST /leads/import/:importId/start — store fieldMap + enqueue processing
  app.post('/:importId/start', async (req, reply) => {
    if (!can(req.auth.role, 'leads.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { importId } = req.params as { importId: string };
    const body = req.body as { fieldMap: Record<string, string> };

    if (!body.fieldMap || typeof body.fieldMap !== 'object') {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'fieldMap required' } });
    }

    if (!body.fieldMap['name'] || !body.fieldMap['phone']) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Must map name and phone columns' } });
    }

    const csvImport = await req.withTenant((tx) =>
      tx.csvImport.findUnique({
        where: { id: importId },
        select: { id: true, s3Key: true, status: true, tenantId: true },
      }),
    );

    if (!csvImport) {
      return reply.code(404).send({ error: { code: 'csv_import.not_found', message: 'Import not found' } });
    }
    if (csvImport.status !== 'PENDING') {
      return reply.code(409).send({ error: { code: 'csv_import.already_started', message: 'Import already started' } });
    }

    await req.withTenant((tx) =>
      tx.csvImport.update({
        where: { id: importId },
        data: { fieldMap: body.fieldMap as object, status: 'PROCESSING' },
      }),
    );

    await app.queues.csvImport.add('csv-import', {
      importId,
      tenantId: req.auth.tenantId,
      s3Key: csvImport.s3Key,
      fieldMap: body.fieldMap,
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, importId }, 'csv_import.started');
    return reply.send({ data: { importId, status: 'PROCESSING' } });
  });

  // GET /leads/import/:importId — poll status
  app.get('/:importId', async (req, reply) => {
    if (!can(req.auth.role, 'leads.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { importId } = req.params as { importId: string };
    const csvImport = await req.withTenant((tx) =>
      tx.csvImport.findUnique({
        where: { id: importId },
        select: {
          id: true,
          filename: true,
          status: true,
          totalRows: true,
          processedRows: true,
          errorRows: true,
          errors: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );

    if (!csvImport) {
      return reply.code(404).send({ error: { code: 'csv_import.not_found', message: 'Import not found' } });
    }

    return reply.send({ data: csvImport });
  });

  // GET /leads/import — list recent imports
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'leads.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const imports = await req.withTenant((tx) =>
      tx.csvImport.findMany({
        where: { tenantId: req.auth.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          filename: true,
          status: true,
          totalRows: true,
          processedRows: true,
          errorRows: true,
          createdAt: true,
        },
      }),
    );

    return reply.send({ data: imports });
  });
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
