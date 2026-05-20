import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@excess/db';
import { can } from '@excess/shared';
import { z } from 'zod';

const PROJECT_STAGES = ['SURVEY', 'DESIGN', 'MATERIAL_ORDERED', 'INSTALLATION', 'COMMISSIONING', 'HANDED_OVER'] as const;
type ProjectStage = (typeof PROJECT_STAGES)[number];

// Timestamps stamped (if not already set) when the project enters a stage
const STAGE_ENTRY_STAMPS: Record<string, string[]> = {
  DESIGN: ['surveyDoneAt'],
  MATERIAL_ORDERED: ['designApprovedAt', 'materialOrderedAt'],
  INSTALLATION: ['installStartedAt'],
  COMMISSIONING: ['commissionedAt'],
  HANDED_OVER: ['handedOverAt'],
};

function generateProjectNumber(): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `PRJ-${yyyymm}-${hex}`;
}

const photoSchema = z.object({
  stage: z.string().max(40),
  url: z.string().url().max(500),
  caption: z.string().max(200).optional(),
  addedAt: z.string().optional(),
});

const createProjectSchema = z.object({
  leadId: z.string().uuid(),
  systemKw: z.number().min(0).optional(),
  totalValueInr: z.number().min(0).optional(),
});

const patchProjectSchema = z.object({
  stage: z.enum(PROJECT_STAGES).optional(),
  assignedEngineerId: z.string().uuid().nullable().optional(),
  systemKw: z.number().min(0).optional(),
  totalValueInr: z.number().min(0).optional(),
  notes: z.string().max(5000).nullable().optional(),
  photos: z.array(photoSchema).optional(),
});

export const projectsRoutes: FastifyPluginAsync = async (app) => {
  // GET /projects — list with stage filter + cursor pagination
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'projects.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { stage?: string; search?: string; cursor?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? 25), 100);

    const projects = await req.withTenant((tx) =>
      tx.project.findMany({
        where: {
          tenantId: req.auth.tenantId,
          ...(query.stage && { stage: query.stage as ProjectStage }),
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
          createdAt: true,
          lead: { select: { id: true, name: true, phone: true, city: true } },
        },
      }),
    );

    const hasMore = projects.length > limit;
    const items = hasMore ? projects.slice(0, limit) : projects;

    return reply.send({
      data: { projects: items, hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
    });
  });

  // GET /projects/:id — detail
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
        },
      }),
    );

    if (!project) {
      return reply.code(404).send({ error: { code: 'project.not_found', message: 'Project not found' } });
    }

    return reply.send({ data: project });
  });

  // POST /projects — manual create for a converted lead
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

  // PATCH /projects/:id — update stage / fields
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

    const { stage, assignedEngineerId, systemKw, totalValueInr, notes, photos } = parsed.data;

    const existing = await req.withTenant((tx) =>
      tx.project.findUnique({
        where: { id },
        select: {
          id: true, stage: true,
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

    const project = await req.withTenant((tx) =>
      tx.project.update({
        where: { id },
        data: data as Parameters<typeof tx.project.update>[0]['data'],
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, projectId: id, stage }, 'project.updated');
    return reply.send({ data: project });
  });
};
