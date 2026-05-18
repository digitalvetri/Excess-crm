import type { FastifyPluginAsync } from 'fastify';
import { prisma, Prisma } from '@excess/db';
import { can } from '@excess/shared';
import { z } from 'zod';

const createQuotationSchema = z.object({
  leadId: z.string().uuid(),
  systemKw: z.number().positive(),
  brandTier: z.enum(['ECONOMY', 'MID', 'PREMIUM']),
  totalInr: z.number().positive(),
  subsidyInr: z.number().min(0),
  netPayable: z.number().min(0),
  emiMonthly: z.number().positive().optional(),
  paybackYears: z.number().positive().optional(),
  lineItems: z.array(z.unknown()).optional(),
});

const patchQuotationSchema = z.object({
  systemKw: z.number().positive().optional(),
  brandTier: z.enum(['ECONOMY', 'MID', 'PREMIUM']).optional(),
  totalInr: z.number().positive().optional(),
  subsidyInr: z.number().min(0).optional(),
  netPayable: z.number().min(0).optional(),
  emiMonthly: z.number().positive().optional(),
  paybackYears: z.number().positive().optional(),
  lineItems: z.array(z.unknown()).optional(),
});

const sendQuotationSchema = z.object({
  via: z.enum(['whatsapp', 'email']),
});

function generateQuotationNumber(): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const hex = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0');
  return `QUO-${yyyymm}-${hex}`;
}

export const quotationsRoutes: FastifyPluginAsync = async (app) => {
  // GET /quotations — list quotations for tenant
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'quotations.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { leadId?: string; status?: string; cursor?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? 20), 100);

    const quotations = await req.withTenant(async (tx) =>
      tx.quotation.findMany({
        where: {
          ...(query.leadId && { leadId: query.leadId }),
          ...(query.status && { status: query.status as never }),
          ...(query.cursor && { id: { lt: query.cursor } }),
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        select: {
          id: true,
          number: true,
          leadId: true,
          systemKw: true,
          brandTier: true,
          totalInr: true,
          subsidyInr: true,
          netPayable: true,
          emiMonthly: true,
          paybackYears: true,
          status: true,
          sentAt: true,
          sentVia: true,
          pdfS3Key: true,
          createdByUserId: true,
          createdAt: true,
          lead: { select: { name: true, phone: true } },
        },
      }),
    );

    const hasMore = quotations.length > limit;
    const items = hasMore ? quotations.slice(0, limit) : quotations;

    return reply.send({
      data: { quotations: items, hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
    });
  });

  // GET /quotations/:id — single quotation
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'quotations.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const quotation = await req.withTenant(async (tx) =>
      tx.quotation.findUnique({
        where: { id },
        include: { lead: { select: { name: true, phone: true, stage: true } } },
      }),
    );

    if (!quotation) {
      return reply.code(404).send({ error: { code: 'quotation.not_found', message: 'Quotation not found' } });
    }

    return reply.send({ data: quotation });
  });

  // POST /quotations — create quotation
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'quotations.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createQuotationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const {
      leadId,
      systemKw,
      brandTier,
      totalInr,
      subsidyInr,
      netPayable,
      emiMonthly,
      paybackYears,
      lineItems,
    } = parsed.data;

    // Generate unique number; retry once on collision (P2002)
    const createWithNumber = async (number: string) =>
      req.withTenant(async (tx) =>
        tx.quotation.create({
          data: {
            tenantId: req.auth.tenantId,
            leadId,
            number,
            systemKw,
            brandTier,
            totalInr,
            subsidyInr,
            netPayable,
            ...(emiMonthly !== undefined && { emiMonthly }),
            ...(paybackYears !== undefined && { paybackYears }),
            ...(lineItems !== undefined && { lineItems: lineItems as Prisma.InputJsonValue }),
            createdByUserId: req.auth.userId,
          },
        }),
      );

    let quotation;
    try {
      quotation = await createWithNumber(generateQuotationNumber());
    } catch (err: unknown) {
      // Retry once on unique constraint violation (Prisma error code P2002)
      const prismaErr = err as { code?: string };
      if (prismaErr.code === 'P2002') {
        try {
          quotation = await createWithNumber(generateQuotationNumber());
        } catch (retryErr: unknown) {
          const retryPrismaErr = retryErr as { code?: string };
          if (retryPrismaErr.code === 'P2002') {
            return reply.code(409).send({
              error: { code: 'quotation.number_conflict', message: 'Quotation number collision — try again' },
            });
          }
          throw retryErr;
        }
      } else {
        throw err;
      }
    }

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, quotationId: quotation.id, leadId },
      'quotation.created',
    );
    return reply.code(201).send({ data: quotation });
  });

  // PATCH /quotations/:id — update (DRAFT only)
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'quotations.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchQuotationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const existing = await req.withTenant(async (tx) =>
      tx.quotation.findUnique({ where: { id }, select: { id: true, status: true } }),
    );

    if (!existing) {
      return reply.code(404).send({ error: { code: 'quotation.not_found', message: 'Quotation not found' } });
    }

    if (existing.status !== 'DRAFT') {
      return reply.code(409).send({
        error: { code: 'quotation.not_draft', message: 'Only DRAFT quotations can be updated' },
      });
    }

    const updateData = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;

    if (Object.keys(updateData).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    const quotation = await req.withTenant(async (tx) => tx.quotation.update({ where: { id }, data: updateData as Parameters<typeof tx.quotation.update>[0]['data'] }));

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, quotationId: id }, 'quotation.updated');
    return reply.send({ data: quotation });
  });

  // POST /quotations/:id/send — send quotation via whatsapp or email
  app.post('/:id/send', async (req, reply) => {
    if (!can(req.auth.role, 'quotations.send')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = sendQuotationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { via } = parsed.data;

    const quotation = await req.withTenant(async (tx) =>
      tx.quotation.findUnique({
        where: { id },
        include: { lead: { select: { id: true, name: true, phone: true, email: true } } },
      }),
    );

    if (!quotation) {
      return reply.code(404).send({ error: { code: 'quotation.not_found', message: 'Quotation not found' } });
    }

    if (via === 'whatsapp') {
      await app.queues.whatsappSend.add('whatsapp-send', {
        tenantId: req.auth.tenantId,
        leadId: quotation.leadId,
        phone: quotation.lead.phone,
        template: 'QUOTATION_SENT',
        vars: {
          leadName: quotation.lead.name,
          quotationNumber: quotation.number,
          netPayable: String(quotation.netPayable),
          systemKw: String(quotation.systemKw),
        },
      });
    } else {
      const recipientEmail = quotation.lead.email;
      if (!recipientEmail) {
        return reply.code(422).send({
          error: { code: 'quotation.no_email', message: 'Lead has no email address for email delivery' },
        });
      }

      await app.queues.emailSend.add('email-send', {
        tenantId: req.auth.tenantId,
        to: recipientEmail,
        subject: `Your Solar Quotation ${quotation.number} — Excess Renew`,
        template: 'QUOTATION_SENT_CONFIRMATION',
        vars: {
          leadName: quotation.lead.name,
          via,
          quotationNumber: quotation.number,
        },
      });
    }

    const updated = await req.withTenant(async (tx) =>
      tx.quotation.update({
        where: { id },
        data: { sentAt: new Date(), sentVia: via, status: 'SENT' },
      }),
    );

    await req.withTenant((tx) =>
      tx.leadActivity.create({
        data: {
          leadId: quotation.leadId,
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          actorIsAi: false,
          type: 'QUOTATION_SENT',
          payload: { quotationId: id, quotationNumber: quotation.number, via } as object,
        },
      }),
    );

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, quotationId: id, via },
      'quotation.sent',
    );
    return reply.send({ data: updated });
  });
};
