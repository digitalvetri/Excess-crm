import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { Prisma } from '@excess/db';
import { z } from 'zod';

const createTeamSchema = z.object({
  name: z.string().min(2).max(100),
  leaderUserId: z.string().uuid().optional(),
  scope: z.record(z.unknown()).optional(),
});

const patchTeamSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  leaderUserId: z.string().uuid().optional(),
  scope: z.record(z.unknown()).optional(),
});

export const teamsRoutes: FastifyPluginAsync = async (app) => {
  // GET /teams — list all teams for tenant
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'teams.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const teams = await req.withTenant(async (tx) =>
      tx.team.findMany({
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, name: true, leaderUserId: true, createdAt: true,
          _count: { select: { members: true, leads: true } },
          members: {
            select: { id: true, name: true, role: true },
            take: 10,
          },
        },
      }),
    );

    return reply.send({ data: teams });
  });

  // GET /teams/:id
  app.get('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'teams.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const team = await req.withTenant(async (tx) =>
      tx.team.findUnique({
        where: { id },
        include: {
          members: { select: { id: true, name: true, email: true, role: true, isActive: true } },
          routingRules: { orderBy: { priority: 'asc' } },
        },
      }),
    );

    if (!team) {
      return reply.code(404).send({ error: { code: 'team.not_found', message: 'Team not found' } });
    }

    return reply.send({ data: team });
  });

  // POST /teams
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'teams.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createTeamSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { name, leaderUserId, scope } = parsed.data;

    const team = await req.withTenant(async (tx) =>
      tx.team.create({
        data: {
          tenantId: req.auth.tenantId,
          name,
          ...(leaderUserId !== undefined && { leaderUserId }),
          ...(scope !== undefined && { scope: scope as Prisma.InputJsonValue }),
        },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, teamId: team.id }, 'team.created');
    return reply.code(201).send({ data: team });
  });

  // PATCH /teams/:id
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'teams.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = patchTeamSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const cleanData = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;

    if (Object.keys(cleanData).length === 0) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'No fields to update' } });
    }

    const team = await req.withTenant(async (tx) =>
      tx.team.update({ where: { id }, data: cleanData as Parameters<typeof tx.team.update>[0]['data'] }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, teamId: id }, 'team.updated');
    return reply.send({ data: team });
  });

  // POST /teams/:id/members — add a user to team
  app.post('/:id/members', async (req, reply) => {
    if (!can(req.auth.role, 'teams.members.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = z.object({ userId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'A valid userId (uuid) is required' } });
    }
    const { userId } = parsed.data;

    await req.withTenant(async (tx) =>
      tx.user.update({ where: { id: userId }, data: { teamId: id } }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, teamId: id, memberId: userId }, 'team.member_added');
    return reply.send({ data: { success: true } });
  });

  // DELETE /teams/:id/members/:userId — remove user from team
  app.delete('/:id/members/:userId', async (req, reply) => {
    if (!can(req.auth.role, 'teams.members.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { userId } = req.params as { id: string; userId: string };

    await req.withTenant(async (tx) =>
      tx.user.update({ where: { id: userId }, data: { teamId: null } }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, memberId: userId }, 'team.member_removed');
    return reply.send({ data: { success: true } });
  });
};
