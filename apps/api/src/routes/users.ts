import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';

export const usersRoutes: FastifyPluginAsync = async (app) => {
  // GET /users — list users for assignment dropdowns
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'leads.assign')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const users = await req.withTenant(async (tx) =>
      tx.user.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, email: true, role: true, teamId: true,
          team: { select: { id: true, name: true } },
        },
      }),
    );

    return reply.send({ data: users });
  });
};
