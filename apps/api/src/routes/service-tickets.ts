import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import { Prisma } from '@excess/db';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@excess/config';
import { can } from '@excess/shared';
import { nanoid } from 'nanoid';
import { z } from 'zod';

const s3 = new S3Client({ region: env.AWS_REGION });

// ── WhatsApp helpers ──────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('91') ? digits : `91${digits}`;
}

const STATUS_WA_MESSAGE: Partial<Record<string, (name: string, subject: string) => string>> = {
  IN_PROGRESS: (name, subject) =>
    `Hi ${name}, your service request *"${subject}"* is now being worked on by our team. We'll keep you updated!`,
  RESOLVED: (name, subject) =>
    `Hi ${name}, your service request *"${subject}"* has been resolved. Thank you for your patience! Please reach out if you need anything further.`,
  CLOSED: (name, subject) =>
    `Hi ${name}, your service request *"${subject}"* has been closed. Thank you for choosing Excess Solar!`,
};

const TICKET_TYPES     = ['COMPLAINT', 'AMC_VISIT', 'WARRANTY', 'GENERAL'] as const;
const TICKET_STATUSES  = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
const PRIORITIES       = ['P1', 'P2', 'P3', 'P4'] as const;

type TicketType   = (typeof TICKET_TYPES)[number];
type TicketStatus = (typeof TICKET_STATUSES)[number];

interface ActivityEntry {
  id: string;
  type: 'created' | 'status_change' | 'comment' | 'photo' | 'visit_scheduled' | 'assigned' | 'sla_breach';
  text?: string;
  fromStatus?: string;
  toStatus?: string;
  s3Key?: string;
  photoUrl?: string;
  caption?: string;
  visitAt?: string;
  engineerName?: string;
  authorName: string;
  authorId: string;
  createdAt: string;
}

function mkEntry(fields: Omit<ActivityEntry, 'id' | 'createdAt'>): ActivityEntry {
  return { ...fields, id: nanoid(10), createdAt: new Date().toISOString() };
}

function parseLog(raw: unknown): ActivityEntry[] {
  return Array.isArray(raw) ? (raw as ActivityEntry[]) : [];
}

async function enrichLog(log: ActivityEntry[]): Promise<ActivityEntry[]> {
  return Promise.all(
    log.map(async (e) => {
      if (e.type === 'photo' && e.s3Key && !e.photoUrl) {
        const cmd = new GetObjectCommand({ Bucket: env.S3_BUCKET_ASSETS, Key: e.s3Key });
        const url = await getSignedUrl(s3, cmd, { expiresIn: 300 });
        return { ...e, photoUrl: url };
      }
      return e;
    }),
  );
}

const createSchema = z.object({
  leadId:             z.string().uuid(),
  projectId:          z.string().uuid().optional(),
  type:               z.enum(TICKET_TYPES),
  subject:            z.string().min(1).max(200),
  description:        z.string().min(1).max(5000),
  priority:           z.enum(PRIORITIES).optional(),
  scheduledVisitAt:   z.string().datetime().optional(),
  assignedEngineerId: z.string().uuid().optional(),
});

const patchSchema = z.object({
  status:             z.enum(TICKET_STATUSES).optional(),
  priority:           z.enum(PRIORITIES).optional(),
  subject:            z.string().min(1).max(200).optional(),
  description:        z.string().min(1).max(5000).optional(),
  scheduledVisitAt:   z.string().datetime().nullable().optional(),
  assignedEngineerId: z.string().uuid().nullable().optional(),
});

const bulkSchema = z.object({
  ids:  z.array(z.string().uuid()).min(1).max(100),
  data: z.object({
    assignedEngineerId: z.string().uuid().nullable().optional(),
    status:             z.enum(TICKET_STATUSES).optional(),
  }),
});

const addCommentSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const serviceTicketsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });

  // ── POST /service-tickets/bulk ───────────────────────────────────────────────
  app.post('/bulk', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }

    const { ids, data } = parsed.data;
    const { status, assignedEngineerId } = data;

    if (status === undefined && assignedEngineerId === undefined) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    const updateData: Record<string, unknown> = {};
    if (assignedEngineerId !== undefined) updateData['assignedEngineerId'] = assignedEngineerId;
    if (status !== undefined) {
      updateData['status']     = status;
      updateData['resolvedAt'] = (status === 'RESOLVED' || status === 'CLOSED') ? new Date() : null;
    }

    await req.withTenant((tx) =>
      Promise.all(
        ids.map((id) =>
          tx.serviceTicket.update({
            where: { id },
            data: updateData as Parameters<typeof tx.serviceTicket.update>[0]['data'],
          })
        )
      )
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, count: ids.length }, 'service_ticket.bulk_updated');
    return reply.send({ data: { updated: ids.length } });
  });

  // ── GET /service-tickets/alerts ──────────────────────────────────────────────
  app.get('/alerts', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const now    = Date.now();
    const active = ['OPEN', 'IN_PROGRESS'] as TicketStatus[];

    const [p1Over, p2Over, p3Over, p4Over, unassignedP1] = await req.withTenant((tx) =>
      Promise.all([
        tx.serviceTicket.count({ where: { priority: 'P1', status: { in: active }, createdAt: { lte: new Date(now - 24 * 3600000) } } }),
        tx.serviceTicket.count({ where: { priority: 'P2', status: { in: active }, createdAt: { lte: new Date(now - 48 * 3600000) } } }),
        tx.serviceTicket.count({ where: { priority: 'P3', status: { in: active }, createdAt: { lte: new Date(now - 120 * 3600000) } } }),
        tx.serviceTicket.count({ where: { priority: 'P4', status: { in: active }, createdAt: { lte: new Date(now - 240 * 3600000) } } }),
        tx.serviceTicket.count({ where: { priority: 'P1', assignedEngineerId: null, status: { in: active }, createdAt: { lte: new Date(now - 2 * 3600000) } } }),
      ]),
    );

    return reply.send({ data: { overdueCount: p1Over + p2Over + p3Over + p4Over, unassignedP1Count: unassignedP1 } });
  });

  // ── GET /service-tickets ─────────────────────────────────────────────────────
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const q = req.query as {
      status?: string; type?: string; projectId?: string; cursor?: string; limit?: string;
      visitFrom?: string; visitTo?: string; engineerId?: string; unscheduled?: string;
      from?: string; to?: string;
    };
    const limit = Math.min(Number(q.limit ?? 25), 2000);

    type VisitWhere = { gte?: Date; lte?: Date } | null;
    let visitWhere: VisitWhere | undefined;
    if (q.unscheduled === 'true') {
      visitWhere = null;
    } else if (q.visitFrom || q.visitTo) {
      visitWhere = {
        ...(q.visitFrom && { gte: new Date(q.visitFrom) }),
        ...(q.visitTo   && { lte: new Date(q.visitTo) }),
      };
    }

    const createdAtWhere = (q.from || q.to) ? {
      ...(q.from && { gte: new Date(q.from) }),
      ...(q.to   && { lte: new Date(q.to) }),
    } : undefined;

    const tickets = await req.withTenant((tx) =>
      tx.serviceTicket.findMany({
        where: {
          ...(q.status     && { status:               q.status as TicketStatus }),
          ...(q.type       && { type:                 q.type as TicketType }),
          ...(q.projectId  && { projectId:            q.projectId }),
          ...(q.engineerId && { assignedEngineerId:   q.engineerId }),
          ...(q.cursor     && { id:                   { lt: q.cursor } }),
          ...(visitWhere !== undefined && { scheduledVisitAt: visitWhere }),
          ...(createdAtWhere && { createdAt: createdAtWhere }),
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        take: limit + 1,
        select: {
          id: true, type: true, subject: true, status: true, priority: true,
          scheduledVisitAt: true, assignedEngineerId: true, resolvedAt: true, createdAt: true,
          projectId: true,
          lead:    { select: { id: true, name: true, phone: true } },
          project: { select: { id: true, number: true } },
        },
      }),
    );

    const hasMore = tickets.length > limit;
    const items   = hasMore ? tickets.slice(0, limit) : tickets;
    return reply.send({ data: { tickets: items, hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null } });
  });

  // ── GET /service-tickets/:id ─────────────────────────────────────────────────
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const ticket = await req.withTenant((tx) =>
      tx.serviceTicket.findUnique({
        where: { id },
        include: {
          lead:    { select: { id: true, name: true, phone: true, email: true, city: true } },
          project: { select: { id: true, number: true, stage: true } },
        },
      }),
    );
    if (!ticket) {
      return reply.code(404).send({ error: { code: 'service_ticket.not_found', message: 'Not found' } });
    }

    // Fetch engineer and creator names for display
    const [engineer, creator] = await Promise.all([
      ticket.assignedEngineerId
        ? req.withTenant((tx) => tx.user.findUnique({ where: { id: ticket.assignedEngineerId! }, select: { name: true } }))
        : Promise.resolve(null),
      ticket.createdByUserId
        ? req.withTenant((tx) => tx.user.findUnique({ where: { id: ticket.createdByUserId! }, select: { name: true } }))
        : Promise.resolve(null),
    ]);

    const log     = parseLog(ticket.activityLog);
    const richLog = await enrichLog(log);

    return reply.send({
      data: {
        ...ticket,
        assignedEngineerName: engineer?.name ?? null,
        createdByUserName:    creator?.name ?? null,
        activityLog: richLog,
      },
    });
  });

  // ── POST /service-tickets ────────────────────────────────────────────────────
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const d = parsed.data;
    const reqUser = await req.withTenant((tx) =>
      tx.user.findUnique({ where: { id: req.auth.userId }, select: { name: true } }),
    );
    const authorName = reqUser?.name ?? req.auth.role;

    const initialLog: ActivityEntry[] = [
      mkEntry({ type: 'created', authorName, authorId: req.auth.userId }),
    ];
    if (d.scheduledVisitAt) {
      initialLog.push(mkEntry({ type: 'visit_scheduled', visitAt: d.scheduledVisitAt, authorName, authorId: req.auth.userId }));
    }

    const ticket = await req.withTenant((tx) =>
      tx.serviceTicket.create({
        data: {
          tenantId:        req.auth.tenantId,
          leadId:          d.leadId,
          type:            d.type,
          subject:         d.subject,
          description:     d.description,
          createdByUserId: req.auth.userId,
          activityLog:     initialLog as unknown as Prisma.InputJsonValue[],
          ...(d.projectId          && { projectId:          d.projectId }),
          ...(d.priority           && { priority:           d.priority }),
          ...(d.scheduledVisitAt   && { scheduledVisitAt:   new Date(d.scheduledVisitAt) }),
          ...(d.assignedEngineerId && { assignedEngineerId: d.assignedEngineerId }),
        },
        include: { lead: { select: { name: true, phone: true } } },
      }),
    );

    // Fire-and-forget WhatsApp: ticket raised confirmation
    void app.queues.whatsappSend.add('whatsapp-send', {
      tenantId: req.auth.tenantId,
      leadId:   d.leadId,
      phone:    normalizePhone(ticket.lead.phone),
      template: 'DIRECT_MESSAGE',
      vars: {
        message: `Hi ${ticket.lead.name}, your service request *"${ticket.subject}"* has been raised (ref: ...${ticket.id.slice(-6)}). Our team will contact you shortly.`,
      },
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ticketId: ticket.id, type: d.type }, 'service_ticket.created');
    return reply.code(201).send({ data: ticket });
  });

  // ── PATCH /service-tickets/:id ───────────────────────────────────────────────
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id }   = req.params as { id: string };
    const parsed   = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const [existing, reqUser] = await Promise.all([
      req.withTenant((tx) => tx.serviceTicket.findUnique({
        where:  { id },
        select: { id: true, status: true, activityLog: true, leadId: true, subject: true,
                  lead: { select: { name: true, phone: true } } },
      })),
      req.withTenant((tx) => tx.user.findUnique({ where: { id: req.auth.userId }, select: { name: true } })),
    ]);
    if (!existing) {
      return reply.code(404).send({ error: { code: 'service_ticket.not_found', message: 'Not found' } });
    }
    const authorName = reqUser?.name ?? req.auth.role;
    const log        = parseLog(existing.activityLog);

    const { status, priority, subject, description, scheduledVisitAt, assignedEngineerId } = parsed.data;
    const data: Record<string, unknown> = {};

    if (subject      !== undefined) data['subject']      = subject;
    if (description  !== undefined) data['description']  = description;
    if (priority     !== undefined) data['priority']     = priority;

    if (assignedEngineerId !== undefined) {
      data['assignedEngineerId'] = assignedEngineerId;
      if (assignedEngineerId) {
        const eng = await req.withTenant((tx) =>
          tx.user.findUnique({ where: { id: assignedEngineerId }, select: { name: true } }),
        );
        log.push(mkEntry({ type: 'assigned', engineerName: eng?.name ?? assignedEngineerId, authorName, authorId: req.auth.userId }));
      }
    }

    if (scheduledVisitAt !== undefined) {
      data['scheduledVisitAt'] = scheduledVisitAt ? new Date(scheduledVisitAt) : null;
      if (scheduledVisitAt) {
        log.push(mkEntry({ type: 'visit_scheduled', visitAt: scheduledVisitAt, authorName, authorId: req.auth.userId }));
      }
    }

    if (status !== undefined) {
      data['status']     = status;
      data['resolvedAt'] = (status === 'RESOLVED' || status === 'CLOSED') ? new Date() : null;
      if (status !== existing.status) {
        log.push(mkEntry({ type: 'status_change', fromStatus: existing.status, toStatus: status, authorName, authorId: req.auth.userId }));
      }
    }

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    data['activityLog'] = log as unknown as Prisma.InputJsonValue[];

    const ticket = await req.withTenant((tx) =>
      tx.serviceTicket.update({
        where: { id },
        data: data as Parameters<typeof tx.serviceTicket.update>[0]['data'],
      }),
    );

    // WhatsApp notifications — fire-and-forget
    const leadPhone = existing.lead?.phone;
    const leadName  = existing.lead?.name ?? 'Customer';
    if (leadPhone) {
      const phone = normalizePhone(leadPhone);

      if (status !== undefined && status !== existing.status) {
        const msgFn = STATUS_WA_MESSAGE[status];
        if (msgFn) {
          void app.queues.whatsappSend.add('whatsapp-send', {
            tenantId: req.auth.tenantId,
            leadId:   existing.leadId,
            phone,
            template: 'DIRECT_MESSAGE',
            vars: { message: msgFn(leadName, existing.subject) },
          });
        }
      }

      if (scheduledVisitAt) {
        const visitStr = new Date(scheduledVisitAt).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        void app.queues.whatsappSend.add('whatsapp-send', {
          tenantId: req.auth.tenantId,
          leadId:   existing.leadId,
          phone,
          template: 'DIRECT_MESSAGE',
          vars: { message: `Hi ${leadName}, a technician will visit you on *${visitStr}* for your service request *"${existing.subject}"*. Please be available.` },
        });
      }
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ticketId: id, status }, 'service_ticket.updated');
    return reply.send({ data: ticket });
  });

  // ── POST /service-tickets/:id/comments ──────────────────────────────────────
  app.post('/:id/comments', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = addCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }

    const [existing, reqUser] = await Promise.all([
      req.withTenant((tx) => tx.serviceTicket.findUnique({ where: { id }, select: { id: true, activityLog: true } })),
      req.withTenant((tx) => tx.user.findUnique({ where: { id: req.auth.userId }, select: { name: true } })),
    ]);
    if (!existing) {
      return reply.code(404).send({ error: { code: 'service_ticket.not_found', message: 'Not found' } });
    }
    const authorName = reqUser?.name ?? req.auth.role;
    const log        = parseLog(existing.activityLog);
    log.push(mkEntry({ type: 'comment', text: parsed.data.text, authorName, authorId: req.auth.userId }));

    await req.withTenant((tx) =>
      tx.serviceTicket.update({ where: { id }, data: { activityLog: log as unknown as Prisma.InputJsonValue[] } }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ticketId: id }, 'service_ticket.comment_added');
    return reply.send({ data: { ok: true } });
  });

  // ── POST /service-tickets/:id/notify ────────────────────────────────────────
  app.post('/:id/notify', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = z.object({ message: z.string().min(1).max(1000) }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'message is required' } });
    }

    const ticket = await req.withTenant((tx) =>
      tx.serviceTicket.findUnique({
        where:  { id },
        select: { leadId: true, lead: { select: { name: true, phone: true } } },
      }),
    );
    if (!ticket) {
      return reply.code(404).send({ error: { code: 'service_ticket.not_found', message: 'Not found' } });
    }

    const phoneRaw = process.env['WHATSAPP_ACCESS_TOKEN'] ? ticket.lead.phone : null;
    if (!phoneRaw) {
      return reply.code(503).send({ error: { code: 'whatsapp_not_configured', message: 'WhatsApp not configured' } });
    }

    await app.queues.whatsappSend.add('whatsapp-send', {
      tenantId: req.auth.tenantId,
      leadId:   ticket.leadId,
      phone:    normalizePhone(phoneRaw),
      template: 'DIRECT_MESSAGE',
      vars: { message: parsed.data.message },
    });

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ticketId: id }, 'service_ticket.manual_notify');
    return reply.send({ data: { ok: true } });
  });

  // ── POST /service-tickets/:id/photos ────────────────────────────────────────
  app.post('/:id/photos', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: { code: 'no_file', message: 'No file uploaded' } });

    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    };
    const ext = mimeToExt[data.mimetype] ?? 'jpg';
    const caption = (data.fields['caption'] as { value?: string } | undefined)?.value ?? '';

    const [existing, reqUser] = await Promise.all([
      req.withTenant((tx) => tx.serviceTicket.findUnique({ where: { id }, select: { id: true, activityLog: true } })),
      req.withTenant((tx) => tx.user.findUnique({ where: { id: req.auth.userId }, select: { name: true } })),
    ]);
    if (!existing) return reply.code(404).send({ error: { code: 'service_ticket.not_found', message: 'Not found' } });

    const s3Key  = `service-tickets/${req.auth.tenantId}/${id}/${nanoid(12)}.${ext}`;
    const buffer = await data.toBuffer();

    await s3.send(new PutObjectCommand({
      Bucket:      env.S3_BUCKET_ASSETS,
      Key:         s3Key,
      Body:        buffer,
      ContentType: data.mimetype,
    }));

    const authorName = reqUser?.name ?? req.auth.role;
    const log        = parseLog(existing.activityLog);
    const entry      = mkEntry({ type: 'photo', s3Key, ...(caption ? { caption } : {}), authorName, authorId: req.auth.userId });
    log.push(entry);

    await req.withTenant((tx) =>
      tx.serviceTicket.update({ where: { id }, data: { activityLog: log as unknown as Prisma.InputJsonValue[] } }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ticketId: id, s3Key }, 'service_ticket.photo_added');
    return reply.send({ data: { ok: true } });
  });

  // ── DELETE /service-tickets/:id/photos/:photoId ──────────────────────────────
  app.delete('/:id/photos/:photoId', async (req, reply) => {
    if (!can(req.auth.role, 'service_tickets.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id, photoId } = req.params as { id: string; photoId: string };
    const existing = await req.withTenant((tx) =>
      tx.serviceTicket.findUnique({ where: { id }, select: { id: true, activityLog: true } }),
    );
    if (!existing) return reply.code(404).send({ error: { code: 'service_ticket.not_found', message: 'Not found' } });

    const log   = parseLog(existing.activityLog);
    const photo = log.find((e) => e.id === photoId && e.type === 'photo');
    if (!photo) return reply.code(404).send({ error: { code: 'photo.not_found', message: 'Photo not found' } });

    if (photo.s3Key) {
      await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET_ASSETS, Key: photo.s3Key }));
    }

    const updatedLog = log.filter((e) => e.id !== photoId);
    await req.withTenant((tx) =>
      tx.serviceTicket.update({ where: { id }, data: { activityLog: updatedLog as unknown as Prisma.InputJsonValue[] } }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ticketId: id, photoId }, 'service_ticket.photo_deleted');
    return reply.code(204).send();
  });
};
