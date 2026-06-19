import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { Prisma } from '@excess/db';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@excess/config';
import { can } from '@excess/shared';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { enrollLeadInSequences } from '../lib/sequences.js';
import { signPortalToken } from '../lib/portal-token.js';
import { signNpsToken } from '../lib/nps-token.js';
import { prisma as globalPrisma, withSystemContext } from '@excess/db';

const s3 = new S3Client({ region: env.AWS_REGION });

const PROJECT_STAGES = ['SURVEY', 'DESIGN', 'MATERIAL_ORDERED', 'INSTALLATION', 'COMMISSIONING', 'HANDED_OVER'] as const;
type ProjectStage = (typeof PROJECT_STAGES)[number];

const SUBSIDY_SCHEMES   = ['NONE', 'PM_SURYA_GHAR', 'STATE_TEDA', 'STATE_OTHER'] as const;
const SUBSIDY_STATUSES  = ['NOT_APPLIED', 'APPLIED', 'DISCOM_INSPECTION_SCHEDULED', 'DISCOM_APPROVED', 'PORTAL_UPLOAD_DONE', 'CREDITED'] as const;
const NM_STATUSES       = ['NOT_APPLIED', 'SLD_SUBMITTED', 'LOAD_SANCTION_APPLIED', 'INSPECTION_DONE', 'METER_CHANGED', 'GRID_SYNCED', 'ACTIVE'] as const;
const DOC_CATEGORIES    = ['QUOTATION', 'WORK_ORDER', 'MEASUREMENT_SHEET', 'DESIGN_LAYOUT', 'PURCHASE_ORDER', 'COMMISSIONING_CERT', 'NET_METERING_APPROVAL', 'SUBSIDY_APPROVAL', 'WARRANTY_CARD', 'HANDOVER_CERT', 'OTHER'] as const;
const PAYMENT_TYPES     = ['ADVANCE', 'MATERIALS', 'INSTALLATION', 'COMPLETION', 'SUBSIDY', 'AMC', 'OTHER'] as const;

// Timestamps stamped (if not already set) when the project enters a stage
const STAGE_ENTRY_STAMPS: Record<string, string[]> = {
  DESIGN:           ['surveyDoneAt'],
  MATERIAL_ORDERED: ['designApprovedAt', 'materialOrderedAt'],
  INSTALLATION:     ['installStartedAt'],
  COMMISSIONING:    ['commissionedAt'],
  HANDED_OVER:      ['handedOverAt'],
};

function generateProjectNumber(): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `PRJ-${yyyymm}-${hex}`;
}

const photoSchema = z.object({
  stage:   z.string().max(40),
  url:     z.string().url().max(500),
  caption: z.string().max(200).optional(),
  addedAt: z.string().optional(),
});

const createProjectSchema = z.object({
  leadId:        z.string().uuid(),
  systemKw:      z.number().min(0).optional(),
  totalValueInr: z.number().min(0).optional(),
});

const patchProjectSchema = z.object({
  stage:                  z.enum(PROJECT_STAGES).optional(),
  assignedEngineerId:     z.string().uuid().nullable().optional(),
  systemKw:               z.number().min(0).optional(),
  totalValueInr:          z.number().min(0).optional(),
  notes:                  z.string().max(5000).nullable().optional(),
  photos:                 z.array(photoSchema).optional(),
  expectedCompletionAt:   z.string().datetime().nullable().optional(),
  warrantyStartDate:      z.string().datetime().nullable().optional(),
  amcExpiresAt:           z.string().datetime().nullable().optional(),
  panelWarrantyYears:     z.number().int().min(0).optional(),
  inverterWarrantyYears:  z.number().int().min(0).optional(),
  installWarrantyYears:   z.number().int().min(0).optional(),
});

const patchSubsidySchema = z.object({
  subsidyScheme:         z.enum(SUBSIDY_SCHEMES).optional(),
  subsidyStatus:         z.enum(SUBSIDY_STATUSES).optional(),
  subsidyAppRef:         z.string().max(100).nullable().optional(),
  subsidyExpectedAmtInr: z.number().min(0).nullable().optional(),
  subsidyAppliedAt:      z.string().datetime().nullable().optional(),
  subsidyInspectionAt:   z.string().datetime().nullable().optional(),
  subsidyApprovedAt:     z.string().datetime().nullable().optional(),
  subsidyPortalUploadAt: z.string().datetime().nullable().optional(),
  subsidyCreditedAt:     z.string().datetime().nullable().optional(),
  subsidyCreditedAmtInr: z.number().min(0).nullable().optional(),
});

const patchNetMeteringSchema = z.object({
  netMeteringStatus:        z.enum(NM_STATUSES).optional(),
  netMeteringAppRef:        z.string().max(100).nullable().optional(),
  netMeteringMeterNumber:   z.string().max(50).nullable().optional(),
  netMeteringInspectorName: z.string().max(100).nullable().optional(),
  netMeteringSldAt:         z.string().datetime().nullable().optional(),
  netMeteringLoadAt:        z.string().datetime().nullable().optional(),
  netMeteringInspectionAt:  z.string().datetime().nullable().optional(),
  netMeteringMeterAt:       z.string().datetime().nullable().optional(),
  netMeteringGridSyncAt:    z.string().datetime().nullable().optional(),
  netMeteringFirstExportAt: z.string().datetime().nullable().optional(),
});

const createPaymentSchema = z.object({
  type:        z.enum(PAYMENT_TYPES),
  amountInr:   z.number().positive(),
  receivedAt:  z.string().datetime(),
  method:      z.string().max(30).optional(),
  reference:   z.string().max(100).optional(),
  notes:       z.string().max(1000).optional(),
});

export const projectsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });

  // ── GET /projects/stats ───────────────────────────────────────────────────
  app.get('/stats', async (req, reply) => {
    if (!can(req.auth.role, 'projects.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const tenantId = req.auth.tenantId;
    const [stageCounts, revenueAgg, recentCompleted] = await Promise.all([
      req.withTenant((tx) =>
        tx.project.groupBy({
          by: ['stage'],
          where: { tenantId },
          _count: { _all: true },
        }),
      ),
      req.withTenant((tx) =>
        tx.project.aggregate({
          where: { tenantId, stage: 'HANDED_OVER' },
          _sum: { totalValueInr: true },
          _count: { _all: true },
        }),
      ),
      req.withTenant((tx) => {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        return tx.project.count({
          where: { tenantId, stage: 'HANDED_OVER', handedOverAt: { gte: monthStart } },
        });
      }),
    ]);

    const byStage = Object.fromEntries(
      PROJECT_STAGES.map((s) => [s, stageCounts.find((r) => r.stage === s)?._count._all ?? 0]),
    );
    const total = Object.values(byStage).reduce((a, b) => a + b, 0);

    return reply.send({
      data: {
        total,
        byStage,
        completedRevenue:   revenueAgg._sum.totalValueInr ?? 0,
        totalCompleted:     revenueAgg._count._all,
        completedThisMonth: recentCompleted,
      },
    });
  });

  // ── GET /projects ─────────────────────────────────────────────────────────
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'projects.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { stage?: string; search?: string; cursor?: string; limit?: string; engineerId?: string; subsidyStatus?: string; netMeteringStatus?: string };
    const limit = Math.min(Number(query.limit ?? 25), 100);

    const projects = await req.withTenant((tx) =>
      tx.project.findMany({
        where: {
          tenantId: req.auth.tenantId,
          ...(query.stage              && { stage:               query.stage as ProjectStage }),
          ...(query.engineerId         && { assignedEngineerId:  query.engineerId }),
          ...(query.subsidyStatus      && { subsidyStatus:       query.subsidyStatus as never }),
          ...(query.netMeteringStatus  && { netMeteringStatus:   query.netMeteringStatus as never }),
          ...(query.search && {
            OR: [
              { number: { contains: query.search, mode: 'insensitive' as const } },
              { lead: { name: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }),
          ...(query.cursor && { id: { lt: query.cursor } }),
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        select: {
          id: true,
          number: true,
          stage: true,
          stageChangedAt: true,
          systemKw: true,
          totalValueInr: true,
          assignedEngineerId: true,
          commissionedAt: true,
          handedOverAt: true,
          expectedCompletionAt: true,
          subsidyScheme: true,
          subsidyStatus: true,
          netMeteringStatus: true,
          createdAt: true,
          lead: { select: { id: true, name: true, phone: true, city: true } },
          payments: {
            select: { amountInr: true },
          },
        },
      }),
    );

    const hasMore = projects.length > limit;
    const items = hasMore ? projects.slice(0, limit) : projects;

    return reply.send({
      data: { projects: items, hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
    });
  });

  // ── GET /projects/:id ─────────────────────────────────────────────────────
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'projects.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const project = await req.withTenant((tx) =>
      tx.project.findUnique({
        where: { id },
        include: {
          lead: { select: { id: true, name: true, phone: true, email: true, city: true, state: true, pincode: true } },
          serviceTickets: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, type: true, subject: true, status: true, priority: true, scheduledVisitAt: true, createdAt: true },
          },
          documents: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, category: true, name: true, s3Key: true, sizeBytes: true, mimeType: true, uploadedByUserId: true, createdAt: true },
          },
          payments: {
            orderBy: { receivedAt: 'desc' },
            select: { id: true, type: true, amountInr: true, receivedAt: true, method: true, reference: true, notes: true, recordedByUserId: true, createdAt: true },
          },
        },
      }),
    );

    if (!project) {
      return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });
    }

    return reply.send({ data: project });
  });

  // ── POST /projects ────────────────────────────────────────────────────────
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { leadId, systemKw, totalValueInr } = parsed.data;

    const existing = await req.withTenant((tx) =>
      tx.project.findUnique({ where: { leadId }, select: { id: true } }),
    );
    if (existing) {
      return reply.code(409).send({
        error: { code: 'project.exists', message: 'A project already exists for this lead' },
      });
    }

    const project = await req.withTenant((tx) =>
      tx.project.create({
        data: {
          tenantId: req.auth.tenantId,
          leadId,
          number: generateProjectNumber(),
          ...(systemKw !== undefined && { systemKw }),
          ...(totalValueInr !== undefined && { totalValueInr }),
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: project.id, leadId }, 'project.created');
    return reply.code(201).send({ data: project });
  });

  // ── GET /projects/:id/portal-link ─────────────────────────────────────────
  app.get('/:id/portal-link', async (req, reply) => {
    if (!can(req.auth.role, 'projects.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const project = await req.withTenant((tx) =>
      tx.project.findUnique({ where: { id }, select: { id: true } }),
    );
    if (!project) {
      return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });
    }

    const token = signPortalToken(id, req.auth.tenantId);
    return reply.send({ data: { token, url: `${env.APP_URL}/portal/status/${token}` } });
  });

  // ── PATCH /projects/:id ───────────────────────────────────────────────────
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const {
      stage, assignedEngineerId, systemKw, totalValueInr, notes, photos,
      expectedCompletionAt, warrantyStartDate, amcExpiresAt,
      panelWarrantyYears, inverterWarrantyYears, installWarrantyYears,
    } = parsed.data;

    const existing = await req.withTenant((tx) =>
      tx.project.findUnique({
        where: { id },
        select: {
          id: true, stage: true, leadId: true,
          surveyDoneAt: true, designApprovedAt: true, materialOrderedAt: true,
          installStartedAt: true, commissionedAt: true, handedOverAt: true,
        },
      }),
    );
    if (!existing) {
      return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });
    }

    const data: Record<string, unknown> = {};
    if (assignedEngineerId !== undefined) data['assignedEngineerId'] = assignedEngineerId;
    if (systemKw !== undefined) data['systemKw'] = systemKw;
    if (totalValueInr !== undefined) data['totalValueInr'] = totalValueInr;
    if (notes !== undefined) data['notes'] = notes;
    if (photos !== undefined) data['photos'] = photos as Prisma.InputJsonValue;
    if (expectedCompletionAt !== undefined) data['expectedCompletionAt'] = expectedCompletionAt ? new Date(expectedCompletionAt) : null;
    if (warrantyStartDate !== undefined) data['warrantyStartDate'] = warrantyStartDate ? new Date(warrantyStartDate) : null;
    if (amcExpiresAt !== undefined) data['amcExpiresAt'] = amcExpiresAt ? new Date(amcExpiresAt) : null;
    if (panelWarrantyYears !== undefined) data['panelWarrantyYears'] = panelWarrantyYears;
    if (inverterWarrantyYears !== undefined) data['inverterWarrantyYears'] = inverterWarrantyYears;
    if (installWarrantyYears !== undefined) data['installWarrantyYears'] = installWarrantyYears;

    if (stage && stage !== existing.stage) {
      data['stage'] = stage;
      data['stageChangedAt'] = new Date();
      for (const field of STAGE_ENTRY_STAMPS[stage] ?? []) {
        if (existing[field as keyof typeof existing] == null) {
          data[field] = new Date();
        }
      }
    }

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    const stageChanged = !!stage && stage !== existing.stage;
    const project = await req.withTenant(async (tx) => {
      const updated = await tx.project.update({
        where: { id },
        data: data as Parameters<typeof tx.project.update>[0]['data'],
      });
      if (stageChanged) {
        await enrollLeadInSequences(tx, req.auth.tenantId, existing.leadId, 'PROJECT_STAGE', stage as string);
      }
      return updated;
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: id, stage }, 'project.updated');
    return reply.send({ data: project });
  });

  // ── PATCH /projects/:id/subsidy ───────────────────────────────────────────
  app.patch('/:id/subsidy', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchSubsidySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const existing = await req.withTenant((tx) =>
      tx.project.findUnique({ where: { id }, select: { id: true } }),
    );
    if (!existing) {
      return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });
    }

    const data: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.subsidyScheme !== undefined) data['subsidyScheme'] = d.subsidyScheme;
    if (d.subsidyStatus !== undefined) data['subsidyStatus'] = d.subsidyStatus;
    if (d.subsidyAppRef !== undefined) data['subsidyAppRef'] = d.subsidyAppRef;
    if (d.subsidyExpectedAmtInr !== undefined) data['subsidyExpectedAmtInr'] = d.subsidyExpectedAmtInr;
    if (d.subsidyAppliedAt !== undefined) data['subsidyAppliedAt'] = d.subsidyAppliedAt ? new Date(d.subsidyAppliedAt) : null;
    if (d.subsidyInspectionAt !== undefined) data['subsidyInspectionAt'] = d.subsidyInspectionAt ? new Date(d.subsidyInspectionAt) : null;
    if (d.subsidyApprovedAt !== undefined) data['subsidyApprovedAt'] = d.subsidyApprovedAt ? new Date(d.subsidyApprovedAt) : null;
    if (d.subsidyPortalUploadAt !== undefined) data['subsidyPortalUploadAt'] = d.subsidyPortalUploadAt ? new Date(d.subsidyPortalUploadAt) : null;
    if (d.subsidyCreditedAt !== undefined) data['subsidyCreditedAt'] = d.subsidyCreditedAt ? new Date(d.subsidyCreditedAt) : null;
    if (d.subsidyCreditedAmtInr !== undefined) data['subsidyCreditedAmtInr'] = d.subsidyCreditedAmtInr;

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    const project = await req.withTenant((tx) =>
      tx.project.update({
        where: { id },
        data: data as Parameters<typeof tx.project.update>[0]['data'],
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: id }, 'project.subsidy_updated');
    return reply.send({ data: project });
  });

  // ── PATCH /projects/:id/net-metering ──────────────────────────────────────
  app.patch('/:id/net-metering', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchNetMeteringSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const existing = await req.withTenant((tx) =>
      tx.project.findUnique({ where: { id }, select: { id: true } }),
    );
    if (!existing) {
      return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });
    }

    const data: Record<string, unknown> = {};
    const d = parsed.data;
    if (d.netMeteringStatus !== undefined) data['netMeteringStatus'] = d.netMeteringStatus;
    if (d.netMeteringAppRef !== undefined) data['netMeteringAppRef'] = d.netMeteringAppRef;
    if (d.netMeteringMeterNumber !== undefined) data['netMeteringMeterNumber'] = d.netMeteringMeterNumber;
    if (d.netMeteringInspectorName !== undefined) data['netMeteringInspectorName'] = d.netMeteringInspectorName;
    if (d.netMeteringSldAt !== undefined) data['netMeteringSldAt'] = d.netMeteringSldAt ? new Date(d.netMeteringSldAt) : null;
    if (d.netMeteringLoadAt !== undefined) data['netMeteringLoadAt'] = d.netMeteringLoadAt ? new Date(d.netMeteringLoadAt) : null;
    if (d.netMeteringInspectionAt !== undefined) data['netMeteringInspectionAt'] = d.netMeteringInspectionAt ? new Date(d.netMeteringInspectionAt) : null;
    if (d.netMeteringMeterAt !== undefined) data['netMeteringMeterAt'] = d.netMeteringMeterAt ? new Date(d.netMeteringMeterAt) : null;
    if (d.netMeteringGridSyncAt !== undefined) data['netMeteringGridSyncAt'] = d.netMeteringGridSyncAt ? new Date(d.netMeteringGridSyncAt) : null;
    if (d.netMeteringFirstExportAt !== undefined) data['netMeteringFirstExportAt'] = d.netMeteringFirstExportAt ? new Date(d.netMeteringFirstExportAt) : null;

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    const project = await req.withTenant((tx) =>
      tx.project.update({
        where: { id },
        data: data as Parameters<typeof tx.project.update>[0]['data'],
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: id }, 'project.net_metering_updated');
    return reply.send({ data: project });
  });

  // ── PATCH /projects/:id/checklist ─────────────────────────────────────────
  app.patch('/:id/checklist', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const body = req.body as { stage: string; itemId: string; label?: string; done: boolean };

    if (!body.stage || !body.itemId || typeof body.done !== 'boolean') {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'stage, itemId and done are required' } });
    }

    const existing = await req.withTenant((tx) =>
      tx.project.findUnique({ where: { id }, select: { id: true, stageChecklists: true } }),
    );
    if (!existing) {
      return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });
    }

    const checklists = (existing.stageChecklists as Record<string, { id: string; label: string; done: boolean; doneAt?: string }[]>) ?? {};
    const items = checklists[body.stage] ?? [];
    const idx = items.findIndex((i) => i.id === body.itemId);

    if (idx >= 0) {
      const updated = { ...items[idx]! };
      updated.done = body.done;
      if (body.done) {
        updated.doneAt = new Date().toISOString();
      } else {
        delete updated.doneAt;
      }
      items[idx] = updated;
    } else {
      // Item not in saved state yet — create it
      const newItem: { id: string; label: string; done: boolean; doneAt?: string } = {
        id: body.itemId,
        label: body.label ?? body.itemId,
        done: body.done,
      };
      if (body.done) newItem.doneAt = new Date().toISOString();
      items.push(newItem);
    }

    checklists[body.stage] = items;

    const project = await req.withTenant((tx) =>
      tx.project.update({
        where: { id },
        data: { stageChecklists: checklists as Prisma.InputJsonValue },
        select: { id: true, stageChecklists: true },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: id, stage: body.stage, itemId: body.itemId }, 'project.checklist_updated');
    return reply.send({ data: project });
  });

  // ── POST /projects/:id/documents ──────────────────────────────────────────
  app.post('/:id/documents', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const existing = await req.withTenant((tx) =>
      tx.project.findUnique({ where: { id }, select: { id: true } }),
    );
    if (!existing) {
      return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });
    }

    const file = await req.file();
    if (!file) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No file uploaded' } });
    }

    const rawCategory = file.fields['category'] as { value?: string } | undefined;
    const rawName = file.fields['name'] as { value?: string } | undefined;
    const category = rawCategory?.value ?? 'OTHER';
    const docName = rawName?.value ?? file.filename;

    if (!DOC_CATEGORIES.includes(category as (typeof DOC_CATEGORIES)[number])) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid category' } });
    }

    const buffer = await file.toBuffer();
    const s3Key = `projects/${id}/documents/${nanoid(12)}-${file.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    await s3.send(new PutObjectCommand({
      Bucket: env.S3_BUCKET_ASSETS,
      Key: s3Key,
      Body: buffer,
      ContentType: file.mimetype,
      ContentLength: buffer.length,
    }));

    const doc = await req.withTenant((tx) =>
      tx.projectDocument.create({
        data: {
          tenantId: req.auth.tenantId,
          projectId: id,
          category: category as (typeof DOC_CATEGORIES)[number],
          name: String(docName).slice(0, 200),
          s3Key,
          sizeBytes: buffer.length,
          mimeType: file.mimetype,
          uploadedByUserId: req.auth.userId,
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: id, docId: doc.id }, 'project.document_uploaded');
    return reply.code(201).send({ data: doc });
  });

  // ── DELETE /projects/:id/documents/:docId ─────────────────────────────────
  app.delete('/:id/documents/:docId', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id, docId } = req.params as { id: string; docId: string };
    const doc = await req.withTenant((tx) =>
      tx.projectDocument.findFirst({ where: { id: docId, projectId: id }, select: { id: true, s3Key: true } }),
    );
    if (!doc) {
      return reply.code(404).send({ error: { code: 'document.not_found', message: 'Document not found' } });
    }

    await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET_ASSETS, Key: doc.s3Key }));
    await req.withTenant((tx) => tx.projectDocument.delete({ where: { id: docId } }));

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: id, docId }, 'project.document_deleted');
    return reply.code(204).send();
  });

  // ── GET /projects/:id/documents/:docId/download-url ──────────────────────
  app.get('/:id/documents/:docId/download-url', async (req, reply) => {
    if (!can(req.auth.role, 'projects.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id, docId } = req.params as { id: string; docId: string };
    const doc = await req.withTenant((tx) =>
      tx.projectDocument.findFirst({ where: { id: docId, projectId: id }, select: { id: true, s3Key: true, name: true, mimeType: true } }),
    );
    if (!doc) {
      return reply.code(404).send({ error: { code: 'document.not_found', message: 'Document not found' } });
    }

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: env.S3_BUCKET_ASSETS,
        Key: doc.s3Key,
        ResponseContentDisposition: `attachment; filename="${doc.name}"`,
        ...(doc.mimeType ? { ResponseContentType: doc.mimeType } : {}),
      }),
      { expiresIn: 300 },
    );

    return reply.send({ data: { url, expiresInSeconds: 300 } });
  });

  // ── POST /projects/:id/payments ───────────────────────────────────────────
  app.post('/:id/payments', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = createPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const existing = await req.withTenant((tx) =>
      tx.project.findUnique({ where: { id }, select: { id: true } }),
    );
    if (!existing) {
      return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });
    }

    const { type, amountInr, receivedAt, method, reference, notes } = parsed.data;

    const payment = await req.withTenant((tx) =>
      tx.projectPayment.create({
        data: {
          tenantId: req.auth.tenantId,
          projectId: id,
          type,
          amountInr,
          receivedAt: new Date(receivedAt),
          ...(method && { method }),
          ...(reference && { reference }),
          ...(notes && { notes }),
          recordedByUserId: req.auth.userId,
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: id, paymentId: payment.id, amountInr }, 'project.payment_recorded');
    return reply.code(201).send({ data: payment });
  });

  // ── DELETE /projects/:id/payments/:payId ─────────────────────────────────
  app.delete('/:id/payments/:payId', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id, payId } = req.params as { id: string; payId: string };
    const payment = await req.withTenant((tx) =>
      tx.projectPayment.findFirst({ where: { id: payId, projectId: id }, select: { id: true } }),
    );
    if (!payment) {
      return reply.code(404).send({ error: { code: 'payment.not_found', message: 'Payment not found' } });
    }

    await req.withTenant((tx) => tx.projectPayment.delete({ where: { id: payId } }));

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: id, payId }, 'project.payment_deleted');
    return reply.code(204).send();
  });

  // ── Generation log ───────────────────────────────────────────────────────────

  const addGenerationSchema = z.object({
    month:        z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
    kwhGenerated: z.number().min(0),
  });

  // POST /projects/:id/generation
  app.post('/:id/generation', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id } = req.params as { id: string };
    const body = addGenerationSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: { code: 'validation', message: body.error.message } });

    const project = await req.withTenant((tx) =>
      tx.project.findUnique({ where: { id }, select: { id: true, generationLog: true } }),
    );
    if (!project) return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });

    type GenEntry = { month: string; kwhGenerated: number; recordedAt: string };
    const log = (Array.isArray(project.generationLog) ? project.generationLog : []) as GenEntry[];
    const filtered = log.filter((e) => e.month !== body.data.month);
    filtered.push({ month: body.data.month, kwhGenerated: body.data.kwhGenerated, recordedAt: new Date().toISOString() });
    filtered.sort((a, b) => a.month.localeCompare(b.month));

    const updated = await req.withTenant((tx) =>
      tx.project.update({ where: { id }, data: { generationLog: filtered as Prisma.InputJsonValue[] } }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: id, month: body.data.month }, 'project.generation_logged');
    return reply.send({ data: updated.generationLog });
  });

  // DELETE /projects/:id/generation/:month
  app.delete('/:id/generation/:month', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id, month } = req.params as { id: string; month: string };

    const project = await req.withTenant((tx) =>
      tx.project.findUnique({ where: { id }, select: { id: true, generationLog: true } }),
    );
    if (!project) return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });

    type GenEntry = { month: string; kwhGenerated: number; recordedAt: string };
    const log = (Array.isArray(project.generationLog) ? project.generationLog : []) as GenEntry[];
    const filtered = log.filter((e) => e.month !== month);

    await req.withTenant((tx) =>
      tx.project.update({ where: { id }, data: { generationLog: filtered as Prisma.InputJsonValue[] } }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: id, month }, 'project.generation_deleted');
    return reply.code(204).send();
  });

  // ── WhatsApp milestone notification ─────────────────────────────────────────

  // POST /projects/:id/notify  — send WhatsApp message to customer for current stage
  app.post('/:id/notify', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { id } = req.params as { id: string };

    const project = await req.withTenant((tx) =>
      tx.project.findUnique({
        where: { id },
        select: { id: true, number: true, stage: true, systemKw: true, lead: { select: { name: true, phone: true } } },
      }),
    );
    if (!project) return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });

    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      return reply.code(503).send({ error: { code: 'whatsapp.not_configured', message: 'WhatsApp credentials not configured' } });
    }

    const name = project.lead.name.split(' ')[0] ?? project.lead.name;
    const kw   = Number(project.systemKw).toFixed(1);
    const STAGE_MESSAGES: Record<string, string> = {
      SURVEY:           `Hi ${name}, your site survey for ${kw} kW solar system (${project.number}) is complete. Our design team will reach out shortly.`,
      DESIGN:           `Hi ${name}, your solar system design for ${project.number} is approved. We are now arranging the materials. ☀️`,
      MATERIAL_ORDERED: `Hi ${name}, materials for your ${kw} kW solar system (${project.number}) have been ordered and are on the way.`,
      INSTALLATION:     `Hi ${name}, installation of your ${kw} kW solar system (${project.number}) has started. Our team is on-site today.`,
      COMMISSIONING:    `Hi ${name}, great news! Your ${kw} kW solar system (${project.number}) has been successfully commissioned. 🌞 Your system is now generating power!`,
      HANDED_OVER:      `Hi ${name}, your ${kw} kW solar system (${project.number}) has been handed over. Welcome to the solar family! Thank you for choosing us. ☀️`,
    };

    const body = STAGE_MESSAGES[project.stage] ?? `Hi ${name}, your project ${project.number} has been updated. Thank you.`;
    const phone = project.lead.phone.replace(/\D/g, '');
    const to = phone.startsWith('91') ? phone : `91${phone}`;

    const waRes = await fetch(
      `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body, preview_url: false },
        }),
      },
    );

    if (!waRes.ok) {
      const err = await waRes.text().catch(() => 'unknown');
      req.log.error({ tenantId: req.auth.tenantId, projectId: id, stage: project.stage, status: waRes.status, err }, 'project.notify_failed');
      return reply.code(502).send({ error: { code: 'whatsapp.send_failed', message: 'WhatsApp message failed to send' } });
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: id, stage: project.stage }, 'project.notified');
    return reply.send({ data: { sent: true, stage: project.stage } });
  });

  // ── GET /projects/upsell-candidates ─────────────────────────────────────────
  app.get('/upsell-candidates', async (req, reply) => {
    if (!can(req.auth.role, 'projects.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);

    const projects = await req.withTenant((tx) =>
      tx.project.findMany({
        where: { stage: 'HANDED_OVER', handedOverAt: { lte: sixMonthsAgo } },
        select: {
          id: true,
          number: true,
          systemKw: true,
          totalValueInr: true,
          handedOverAt: true,
          generationLog: true,
          lead: { select: { id: true, name: true, phone: true, city: true } },
          amcContracts: {
            where: { status: 'ACTIVE' },
            select: { id: true, endDate: true, valueInr: true },
          },
        },
        orderBy: { handedOverAt: 'asc' },
        take: 50,
      }),
    );

    interface GenEntry { month: string; kwhGenerated: number }

    const candidates = projects.map((p) => {
      const rawLog = Array.isArray(p.generationLog) ? p.generationLog : [];
      const log = (rawLog as unknown[]).filter(
        (e): e is GenEntry =>
          typeof e === 'object' && e !== null &&
          'month' in e && 'kwhGenerated' in e &&
          typeof (e as GenEntry).kwhGenerated === 'number',
      );
      const totalKwh = log.reduce((s, r) => s + r.kwhGenerated, 0);
      const avgMonthlyKwhGenerated = log.length > 0 ? Math.round(totalKwh / log.length) : 0;
      const kw = Number(p.systemKw);
      const estimatedBatteryKwh = kw * 2;
      const batteryRoiYears =
        avgMonthlyKwhGenerated > 0
          ? Math.round(((kw * 50000) / (avgMonthlyKwhGenerated * 12 * 7.5)) * 10) / 10
          : 0;
      return {
        id: p.id,
        number: p.number,
        systemKw: kw,
        totalValueInr: Number(p.totalValueInr),
        handedOverAt: p.handedOverAt,
        avgMonthlyKwhGenerated,
        estimatedBatteryKwh,
        batteryRoiYears,
        lead: p.lead,
        amcContracts: p.amcContracts.map((a) => ({
          id: a.id,
          endDate: a.endDate,
          valueInr: a.valueInr !== null ? Number(a.valueInr) : null,
        })),
      };
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, count: candidates.length }, 'projects.upsell_candidates');
    return reply.send({ data: { candidates, total: candidates.length } });
  });

  // ── POST /projects/:id/start-upsell ─────────────────────────────────────────
  app.post('/:id/start-upsell', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const project = await req.withTenant((tx) =>
      tx.project.findUnique({
        where: { id },
        select: { id: true, leadId: true, notes: true, systemKw: true },
      }),
    );

    if (!project) {
      return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });
    }

    const upsellNote = `\n[UPSELL-INITIATED] Battery expansion upsell started on ${new Date().toISOString()}`;
    await req.withTenant((tx) =>
      tx.project.update({
        where: { id },
        data: { notes: (project.notes ?? '') + upsellNote },
      }),
    );

    await app.queues.voiceDial.add(
      'voice-dial',
      { leadId: project.leadId, tenantId: req.auth.tenantId, personaId: 'EXCESS_AGENT' },
      { delay: 0, priority: 1 },
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: project.id }, 'project.upsell_started');
    return reply.send({ data: { message: 'Upsell call queued' } });
  });

  // ── POST /projects/:id/send-nps — trigger NPS survey for converted customer ──
  app.post('/:id/send-nps', async (req, reply) => {
    if (!can(req.auth.role, 'projects.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const tenantId = req.auth.tenantId;

    const project = await req.withTenant((tx) =>
      tx.project.findUnique({
        where: { id },
        select: { leadId: true, lead: { select: { name: true, phone: true } } },
      }),
    );
    if (!project) {
      return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });
    }

    const { leadId, lead } = project;

    const existing = await withSystemContext(globalPrisma, tenantId, (tx) =>
      tx.review.findFirst({ where: { leadId }, select: { id: true } }),
    );

    let reviewId: string;
    if (existing) {
      await withSystemContext(globalPrisma, tenantId, (tx) =>
        tx.review.update({ where: { id: existing.id }, data: { npsRequestedAt: new Date() } }),
      );
      reviewId = existing.id;
    } else {
      const created = await withSystemContext(globalPrisma, tenantId, (tx) =>
        tx.review.create({
          data: { tenantId, leadId, npsRequestedAt: new Date() },
          select: { id: true },
        }),
      );
      reviewId = created.id;
    }

    const npsToken = signNpsToken({ reviewId, leadId, tenantId });
    const npsUrl   = `${env.APP_URL}/portal/nps/${npsToken}`;

    if (lead.phone) {
      void app.queues.whatsappSend.add('whatsapp-send', {
        tenantId,
        leadId,
        phone: lead.phone.replace(/\D/g, '').replace(/^(?!91)/, '91'),
        template: 'DIRECT_MESSAGE',
        vars: {
          message: `Hi ${lead.name}! Your solar system is running great ☀️ Could you share your experience? It takes 30 seconds: ${npsUrl}`,
        },
      });
    }

    req.log.info({ tenantId, userId: req.auth.userId, projectId: id }, 'project.nps_sent');
    return reply.send({ data: { npsUrl } });
  });
};
