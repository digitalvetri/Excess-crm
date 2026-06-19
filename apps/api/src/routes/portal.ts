import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, withSystemContext } from '@excess/db';
import { verifyPortalToken } from '../lib/portal-token.js';
import { verifyNpsToken } from '../lib/nps-token.js';

const npsResponseSchema = z.object({
  npsScore:   z.number().int().min(0).max(10),
  npsComment: z.string().max(1000).optional(),
});

const portalTicketSchema = z.object({
  subject:     z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  type:        z.enum(['COMPLAINT', 'AMC_VISIT', 'WARRANTY', 'GENERAL']).default('GENERAL'),
});

/**
 * Public, unauthenticated customer-facing endpoints.
 * The signed token is the entire auth boundary for each route.
 */
export const portalRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /portal/project/:token — project status ──────────────────────────────
  app.get(
    '/project/:token',
    { config: { public: true, rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      const payload = verifyPortalToken(token);
      if (!payload) {
        return reply.code(404).send({
          error: { code: 'portal.invalid', message: 'This link is invalid or has expired.' },
        });
      }

      const project = await withSystemContext(prisma, payload.tenantId, (tx) =>
        tx.project.findFirst({
          where: { id: payload.projectId, tenantId: payload.tenantId },
          select: {
            number: true,
            stage: true,
            stageChangedAt: true,
            systemKw: true,
            surveyDoneAt: true,
            designApprovedAt: true,
            materialOrderedAt: true,
            installStartedAt: true,
            commissionedAt: true,
            handedOverAt: true,
            photos: true,
            lead: { select: { name: true, city: true } },
            serviceTickets: {
              where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
              orderBy: { scheduledVisitAt: 'asc' },
              select: { type: true, subject: true, status: true, scheduledVisitAt: true },
            },
          },
        }),
      );

      if (!project) {
        return reply.code(404).send({
          error: { code: 'portal.not_found', message: 'Project not found.' },
        });
      }

      return reply.send({ data: project });
    },
  );

  // ── POST /portal/project/:token/ticket — customer raises a service ticket ────
  app.post(
    '/project/:token/ticket',
    { config: { public: true, rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      const payload = verifyPortalToken(token);
      if (!payload) {
        return reply.code(400).send({
          error: { code: 'portal.invalid', message: 'This link is invalid or has expired.' },
        });
      }

      const parsed = portalTicketSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
      }

      const project = await withSystemContext(prisma, payload.tenantId, (tx) =>
        tx.project.findFirst({
          where: { id: payload.projectId, tenantId: payload.tenantId },
          select: { leadId: true },
        }),
      );
      if (!project) {
        return reply.code(404).send({ error: { code: 'portal.not_found', message: 'Project not found.' } });
      }

      await withSystemContext(prisma, payload.tenantId, (tx) =>
        tx.serviceTicket.create({
          data: {
            tenantId:    payload.tenantId,
            projectId:   payload.projectId,
            leadId:      project.leadId,
            type:        parsed.data.type,
            subject:     parsed.data.subject,
            description: parsed.data.description ?? '',
            status:      'OPEN',
            priority:    'P3',
            activityLog: [],
          },
        }),
      );

      return reply.send({
        data: { message: 'Your request has been submitted. Our team will contact you shortly.' },
      });
    },
  );

  // ── GET /portal/nps/:token — check if already responded ──────────────────────
  app.get(
    '/nps/:token',
    { config: { public: true, rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      const payload = verifyNpsToken(token);
      if (!payload) {
        return reply.code(400).send({ error: { code: 'nps.invalid', message: 'Invalid or expired NPS link.' } });
      }

      const review = await withSystemContext(prisma, payload.tenantId, (tx) =>
        tx.review.findUnique({
          where: { id: payload.reviewId },
          select: { npsScore: true, npsComment: true, npsRespondedAt: true },
        }),
      );

      if (!review) {
        return reply.code(404).send({ error: { code: 'nps.not_found', message: 'Survey not found.' } });
      }

      return reply.send({
        data: {
          alreadyResponded: !!review.npsRespondedAt,
          npsScore:         review.npsScore,
        },
      });
    },
  );

  // ── POST /portal/nps/:token — submit NPS response ────────────────────────────
  app.post(
    '/nps/:token',
    { config: { public: true, rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { token } = req.params as { token: string };
      const payload = verifyNpsToken(token);
      if (!payload) {
        return reply.code(400).send({ error: { code: 'nps.invalid', message: 'Invalid or expired NPS link.' } });
      }

      const parsed = npsResponseSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
      }

      await withSystemContext(prisma, payload.tenantId, (tx) =>
        tx.review.update({
          where: { id: payload.reviewId },
          data: {
            npsScore:       parsed.data.npsScore,
            npsComment:     parsed.data.npsComment ?? null,
            npsRespondedAt: new Date(),
          },
        }),
      );

      return reply.send({ data: { message: 'Thank you for your feedback!' } });
    },
  );
};
