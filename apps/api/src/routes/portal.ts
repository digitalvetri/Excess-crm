import type { FastifyPluginAsync } from 'fastify';
import { prisma, withSystemContext } from '@excess/db';
import { verifyPortalToken } from '../lib/portal-token.js';

/**
 * Public, unauthenticated customer-facing project status.
 * The signed token is the entire auth boundary: it carries projectId +
 * tenantId, and the query is scoped to both. Only non-PII, status-level
 * fields are selected — no contact details, financials or internal notes.
 */
export const portalRoutes: FastifyPluginAsync = async (app) => {
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
};
