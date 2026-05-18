import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@excess/db';
import { can } from '@excess/shared';
import { z } from 'zod';

const createArticleSchema = z.object({
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  category: z.string().min(1).max(100),
  language: z.string().min(2).max(10).optional(),
  publishedAt: z.string().datetime({ offset: true }).optional(),
});

const patchArticleSchema = z.object({
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  title: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  category: z.string().min(1).max(100).optional(),
  language: z.string().min(2).max(10).optional(),
  publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const kbRoutes: FastifyPluginAsync = async (app) => {
  // GET /kb — list articles (published for regular users; all for kb.write roles)
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'kb.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as { q?: string; category?: string; language?: string; cursor?: string; limit?: string };
    const limit = Math.min(Number(query.limit ?? 20), 100);

    // kb.write permission means the user can author articles, so they can see unpublished drafts
    const canSeeUnpublished = can(req.auth.role, 'kb.write');

    const articles = await prisma.kbArticle.findMany({
      where: {
        // Non-writers only see published articles
        ...(!canSeeUnpublished && { publishedAt: { not: null, lte: new Date() } }),
        ...(query.category && { category: query.category }),
        ...(query.language && { language: query.language }),
        ...(query.q && { title: { contains: query.q, mode: 'insensitive' } }),
        ...(query.cursor && { id: { lt: query.cursor } }),
      },
      orderBy: { publishedAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        slug: true,
        title: true,
        category: true,
        language: true,
        publishedAt: true,
        createdAt: true,
        // Omit body for list — fetch full content on single article request
      },
    });

    const hasMore = articles.length > limit;
    const items = hasMore ? articles.slice(0, limit) : articles;

    return reply.send({
      data: { articles: items, hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null },
    });
  });

  // GET /kb/:slug — single article by slug
  app.get('/:slug', async (req, reply) => {
    if (!can(req.auth.role, 'kb.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { slug } = req.params as { slug: string };
    const canSeeUnpublished = can(req.auth.role, 'kb.write');

    const article = await prisma.kbArticle.findUnique({ where: { slug } });

    if (!article) {
      return reply.code(404).send({ error: { code: 'kb.not_found', message: 'Article not found' } });
    }

    // Non-writers cannot view unpublished articles
    if (!canSeeUnpublished && (!article.publishedAt || article.publishedAt > new Date())) {
      return reply.code(404).send({ error: { code: 'kb.not_found', message: 'Article not found' } });
    }

    return reply.send({ data: article });
  });

  // POST /kb — create article
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'kb.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createArticleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { slug, title, body, category, language, publishedAt } = parsed.data;

    let article;
    try {
      article = await prisma.kbArticle.create({
        data: {
          slug,
          title,
          body,
          category,
          ...(language !== undefined && { language }),
          ...(publishedAt !== undefined && { publishedAt: new Date(publishedAt) }),
        },
      });
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr.code === 'P2002') {
        return reply.code(409).send({
          error: { code: 'kb.slug_conflict', message: 'An article with this slug already exists' },
        });
      }
      throw err;
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, articleId: article.id, slug }, 'kb.article_created');
    return reply.code(201).send({ data: article });
  });

  // PATCH /kb/:id — update article
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'kb.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchArticleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const existing = await prisma.kbArticle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return reply.code(404).send({ error: { code: 'kb.not_found', message: 'Article not found' } });
    }

    // Build update data, filtering undefined (but keeping null for publishedAt to unpublish)
    const rawData = parsed.data;
    const updateData: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(rawData)) {
      if (v !== undefined) {
        if (k === 'publishedAt') {
          // null means unpublish; string means set new date
          updateData[k] = v === null ? null : new Date(v as string);
        } else {
          updateData[k] = v;
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    let article;
    try {
      article = await prisma.kbArticle.update({ where: { id }, data: updateData as Parameters<typeof prisma.kbArticle.update>[0]['data'] });
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr.code === 'P2002') {
        return reply.code(409).send({
          error: { code: 'kb.slug_conflict', message: 'An article with this slug already exists' },
        });
      }
      throw err;
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, articleId: id }, 'kb.article_updated');
    return reply.send({ data: article });
  });
};
