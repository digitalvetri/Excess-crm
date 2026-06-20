import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { seedDemoData } from '../lib/demo-seed.js';

// TEMPORARY admin-only endpoint to load demo data into a fresh production DB.
// Remove this route (and lib/demo-seed.ts) after a one-time use.
export const adminSeedRoutes: FastifyPluginAsync = async (app) => {
  app.post('/seed-demo', async (req, reply) => {
    if (!can(req.auth.role, 'admin.users')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const result = await seedDemoData();
    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, ...result }, 'admin.seed_demo');
    return reply.send({ data: result });
  });
};
