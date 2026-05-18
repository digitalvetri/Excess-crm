import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { z } from 'zod';

const createReviewSchema = z.object({
  leadId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  source: z.string().optional(),
});

export const reviewsRoutes: FastifyPluginAsync = async (app) => {
  // GET /reviews/summary — aggregate rating stats (before /:leadId to avoid route conflict)
  app.get('/summary', async (req, reply) => {
    if (!can(req.auth.role, 'reviews.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { avgRating, totalCount, distribution } = await req.withTenant(async (tx) => {
      const aggregate = await tx.review.aggregate({
        _avg: { rating: true },
        _count: { id: true },
      });

      const grouped = await tx.review.groupBy({
        by: ['rating'],
        _count: { id: true },
        orderBy: { rating: 'asc' },
      });

      return {
        avgRating: aggregate._avg.rating ?? 0,
        totalCount: aggregate._count.id,
        distribution: grouped.map((g) => ({ rating: g.rating, count: g._count.id })),
      };
    });

    return reply.send({ data: { avgRating, totalCount, distribution } });
  });

  // GET /reviews — list reviews for tenant, optional ?leadId= filter
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'reviews.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { leadId?: string };

    const reviews = await req.withTenant(async (tx) =>
      tx.review.findMany({
        where: {
          ...(query.leadId && { leadId: query.leadId }),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          lead: { select: { name: true } },
        },
      }),
    );

    return reply.send({ data: reviews });
  });

  // POST /reviews — create a review
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'reviews.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { leadId, rating, comment, source } = parsed.data;

    const review = await req.withTenant(async (tx) => {
      // Verify the lead belongs to this tenant (RLS scopes the query)
      const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { id: true } });
      if (!lead) return null;

      return tx.review.create({
        data: Object.fromEntries(
          Object.entries({
            tenantId: req.auth.tenantId,
            leadId,
            rating,
            comment,
            source,
          }).filter(([, v]) => v !== undefined),
        ) as {
          tenantId: string;
          leadId: string;
          rating: number;
          comment?: string;
          source?: string;
        },
      });
    });

    if (!review) {
      return reply.code(404).send({ error: { code: 'lead.not_found', message: 'Lead not found' } });
    }

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, reviewId: review.id, leadId },
      'review.created',
    );
    return reply.code(201).send({ data: review });
  });
};
