import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';

export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  // GET /notifications — list for current user (latest 50, unread first)
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'leads.read.own')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }
    const { tenantId, userId } = req.auth;
    const items = await req.withTenant(async (tx) => {
      return tx.notification.findMany({
        where: { tenantId, userId },
        orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
        take: 50,
      });
    });
    const unreadCount = items.filter((n) => !n.isRead).length;
    return reply.send({ data: items, meta: { unreadCount } });
  });

  // PATCH /notifications/:id/read — mark single as read
  app.patch('/:id/read', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { tenantId, userId } = req.auth;
    await req.withTenant(async (tx) => {
      await tx.notification.updateMany({
        where: { id, tenantId, userId },
        data: { isRead: true },
      });
    });
    return reply.send({ data: { ok: true } });
  });

  // POST /notifications/read-all — mark all as read
  app.post('/read-all', async (req, reply) => {
    const { tenantId, userId } = req.auth;
    await req.withTenant(async (tx) => {
      await tx.notification.updateMany({
        where: { tenantId, userId, isRead: false },
        data: { isRead: true },
      });
    });
    return reply.send({ data: { ok: true } });
  });

  // DELETE /notifications/:id — dismiss
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { tenantId, userId } = req.auth;
    await req.withTenant(async (tx) => {
      await tx.notification.deleteMany({ where: { id, tenantId, userId } });
    });
    return reply.code(204).send();
  });
}
