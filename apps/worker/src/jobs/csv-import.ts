import type { Job } from 'bullmq';
import pino from 'pino';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { prisma, withSystemContext } from '@excess/db';
import { env } from '@excess/config';
import { queues } from '../queues.js';

const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const s3 = new S3Client({ region: env.AWS_REGION });
const S3_BUCKET = env.S3_BUCKET_ASSETS;

export interface CsvImportPayload {
  importId: string;
  tenantId: string;
  s3Key: string;
  fieldMap: Record<string, string>;
}

// fieldMap keys are lead field names, values are CSV column names
// e.g. { name: 'Full Name', phone: 'Mobile', city: 'City' }

export async function processCsvImport(job: Job<CsvImportPayload>): Promise<void> {
  const { importId, tenantId, s3Key, fieldMap } = job.data;
  const log = logger.child({ importId, tenantId });

  let csvText: string;

  // Try S3 first; fall back to Redis for local dev
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    csvText = Buffer.concat(chunks).toString('utf-8');
  } catch {
    const redisClient = (await import('../redis.js')).redis;
    const cached = await redisClient.get(`csv:${importId}`);
    if (!cached) throw new Error(`CSV not found in S3 or Redis for importId=${importId}`);
    csvText = cached;
  }

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    await markFailed(importId, tenantId, 'CSV has no data rows');
    return;
  }

  const headers = parseCSVLine(lines[0]!);
  const rows = lines.slice(1);

  // Invert fieldMap: csvColumn -> leadField
  const colToField = new Map<string, string>();
  for (const [leadField, csvCol] of Object.entries(fieldMap)) {
    const idx = headers.indexOf(csvCol);
    if (idx !== -1) colToField.set(String(idx), leadField);
  }

  let processed = 0;
  let errorCount = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const cells = parseCSVLine(rows[i]!);
    const rowData: Record<string, string> = {};
    for (const [idxStr, leadField] of colToField.entries()) {
      const idx = parseInt(idxStr, 10);
      rowData[leadField] = cells[idx]?.trim() ?? '';
    }

    const name = rowData['name'] ?? '';
    const phone = rowData['phone'] ?? '';

    if (!name || !phone) {
      errorCount++;
      errors.push({ row: i + 2, message: `Row ${i + 2}: missing name or phone` });
      continue;
    }

    try {
      await queues.leadIngest.add('lead-ingest', {
        sourceType: 'MANUAL',
        tenantId,
        name,
        phone,
        email: rowData['email'] || undefined,
        city: rowData['city'] || undefined,
        utmSource: rowData['utmSource'] || undefined,
        utmMedium: rowData['utmMedium'] || undefined,
        utmCampaign: rowData['utmCampaign'] || undefined,
        rawData: { importId, csvRow: i + 2 },
      });
      processed++;
    } catch (err) {
      errorCount++;
      errors.push({ row: i + 2, message: `Row ${i + 2}: ${err instanceof Error ? err.message : 'unknown error'}` });
    }

    // Update progress every 50 rows
    if ((i + 1) % 50 === 0) {
      await withSystemContext(prisma, tenantId, (tx) =>
        tx.csvImport.update({
          where: { id: importId },
          data: { processedRows: processed, errorRows: errorCount },
        }),
      );
    }
  }

  await withSystemContext(prisma, tenantId, (tx) =>
    tx.csvImport.update({
      where: { id: importId },
      data: {
        status: 'DONE',
        processedRows: processed,
        errorRows: errorCount,
        errors: errors.slice(0, 100) as object,
      },
    }),
  );

  log.info({ processed, errorCount }, 'csv_import.complete');
}

async function markFailed(importId: string, tenantId: string, reason: string): Promise<void> {
  await withSystemContext(prisma, tenantId, (tx) =>
    tx.csvImport.update({
      where: { id: importId },
      data: { status: 'FAILED', errors: [{ message: reason }] as object },
    }),
  );
}

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
