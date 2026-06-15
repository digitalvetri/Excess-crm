import type { FastifyPluginAsync } from 'fastify';
import argon2 from 'argon2';
import { z } from 'zod';
import { can } from '@excess/shared';

const createUserBody = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(['EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER', 'ENGINEER']),
  tenantId: z.string().uuid().optional(), // required when role is FRANCHISE_*
  password: z.string().min(8),
});

const updateUserBody = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  role: z.enum(['EMPLOYEE', 'FRANCHISE_OWNER', 'FRANCHISE_USER', 'ENGINEER']).optional(),
  teamId: z.string().uuid().nullable().optional(),
});

const resetPasswordBody = z.object({
  password: z.string().min(8),
});

export const usersRoutes: FastifyPluginAsync = async (app) => {
  // GET /users — list users for assignment dropdowns (existing, unchanged)
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

  // GET /users/admin/tenants — list franchise tenants for the create-user form
  app.get('/admin/tenants', async (req, reply) => {
    if (!can(req.auth.role, 'admin.users')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const tenants = await req.withTenant(async (tx) =>
      tx.tenant.findMany({
        where: { type: 'FRANCHISE', status: 'ACTIVE' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, tier: true },
      }),
    );

    return reply.send({ data: tenants });
  });

  // GET /users/admin — list all users across tenants
  app.get('/admin', async (req, reply) => {
    if (!can(req.auth.role, 'admin.users')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const query = req.query as Record<string, string>;
    const { role, status, tenantId, search, cursor, limit: limitStr } = query;
    const limit = Math.min(Number(limitStr) || 50, 100);

    const where: Record<string, unknown> = {};
    if (role) where['role'] = role;
    if (status === 'active') where['isActive'] = true;
    if (status === 'inactive') where['isActive'] = false;
    if (tenantId) where['tenantId'] = tenantId;
    if (search) {
      where['OR'] = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const allUsers = await req.withTenant(async (tx) =>
      tx.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true, name: true, email: true, phone: true, role: true,
          isActive: true, lastLoginAt: true, createdAt: true,
          tenantId: true, teamId: true,
          tenant: { select: { id: true, name: true, type: true } },
          team: { select: { id: true, name: true } },
        },
      }),
    );

    const hasMore = allUsers.length > limit;
    const items = hasMore ? allUsers.slice(0, limit) : allUsers;

    return reply.send({
      data: items,
      meta: { nextCursor: hasMore ? items[items.length - 1]?.id : null },
    });
  });

  // POST /users/admin — create a new user
  app.post('/admin', async (req, reply) => {
    if (!can(req.auth.role, 'admin.users')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createUserBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { email, name, phone, role, password } = parsed.data;

    // Franchise roles must be assigned to a franchise tenant
    let targetTenantId = req.auth.tenantId; // default to HQ for EMPLOYEE/ENGINEER
    if (role === 'FRANCHISE_OWNER' || role === 'FRANCHISE_USER') {
      if (!parsed.data.tenantId) {
        return reply.code(400).send({
          error: { code: 'validation_error', message: 'tenantId is required for franchise roles' },
        });
      }
      const tenant = await req.withTenant(async (tx) =>
        tx.tenant.findUnique({ where: { id: parsed.data.tenantId! }, select: { id: true, type: true } }),
      );
      if (!tenant || tenant.type !== 'FRANCHISE') {
        return reply.code(400).send({
          error: { code: 'validation_error', message: 'Invalid franchise tenant' },
        });
      }
      targetTenantId = parsed.data.tenantId;
    }

    const passwordHash = await argon2.hash(password);

    const user = await req.withTenant(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) return null;

      const created = await tx.user.create({
        data: { tenantId: targetTenantId, email, name, phone: phone ?? null, role, passwordHash, isActive: true },
        select: { id: true, email: true, name: true, role: true, tenantId: true, isActive: true, createdAt: true },
      });

      await tx.auditLog.create({
        data: {
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'users.create',
          entityType: 'User',
          entityId: created.id,
          diff: { email, name, role, tenantId: targetTenantId },
        },
      });

      return created;
    });

    if (!user) {
      return reply.code(409).send({
        error: { code: 'users.email_taken', message: 'A user with this email already exists' },
      });
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, newUserId: user.id }, 'users.create');

    return reply.code(201).send({ data: user });
  });

  // GET /users/admin/:id — get user details
  app.get('/admin/:id', async (req, reply) => {
    if (!can(req.auth.role, 'admin.users')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const user = await req.withTenant(async (tx) =>
      tx.user.findUnique({
        where: { id },
        select: {
          id: true, name: true, email: true, phone: true, role: true,
          isActive: true, lastLoginAt: true, createdAt: true, updatedAt: true,
          tenantId: true, teamId: true,
          tenant: { select: { id: true, name: true, type: true, status: true } },
          team: { select: { id: true, name: true } },
        },
      }),
    );

    if (!user) {
      return reply.code(404).send({ error: { code: 'users.not_found', message: 'User not found' } });
    }

    return reply.send({ data: user });
  });

  // PATCH /users/admin/:id — update user details
  app.patch('/admin/:id', async (req, reply) => {
    if (!can(req.auth.role, 'admin.users')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const parsed = updateUserBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData['name'] = parsed.data.name;
    if (parsed.data.phone !== undefined) updateData['phone'] = parsed.data.phone ?? null;
    if (parsed.data.role !== undefined) updateData['role'] = parsed.data.role;
    if ('teamId' in parsed.data) updateData['teamId'] = parsed.data.teamId ?? null;

    const userResult = await req.withTenant(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { id },
        select: { id: true, name: true, role: true, phone: true, teamId: true },
      });
      if (!existing) return null;

      const updated = await tx.user.update({
        where: { id },
        data: updateData,
        select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, teamId: true, updatedAt: true },
      });

      await tx.auditLog.create({
        data: {
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'users.update',
          entityType: 'User',
          entityId: id,
          diff: JSON.parse(JSON.stringify({ before: existing, after: updateData })) as object,
        },
      });

      return updated;
    });

    if (!userResult) {
      return reply.code(404).send({ error: { code: 'users.not_found', message: 'User not found' } });
    }

    const user = userResult;

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, targetUserId: id }, 'users.update');

    return reply.send({ data: user });
  });

  // POST /users/admin/:id/reset-password — admin sets a new password
  app.post('/admin/:id/reset-password', async (req, reply) => {
    if (!can(req.auth.role, 'admin.users')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const parsed = resetPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Password must be at least 8 characters' },
      });
    }

    const passwordHash = await argon2.hash(parsed.data.password);

    const found = await req.withTenant(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return false;

      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.auditLog.create({
        data: {
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'users.reset_password',
          entityType: 'User',
          entityId: id,
          diff: { note: 'Password reset by admin, sessions invalidated' },
        },
      });
      return true;
    });

    if (!found) {
      return reply.code(404).send({ error: { code: 'users.not_found', message: 'User not found' } });
    }

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, targetUserId: id }, 'users.reset_password');

    return reply.send({ data: { ok: true } });
  });

  // PATCH /users/admin/:id/status — activate or deactivate a user
  app.patch('/admin/:id/status', async (req, reply) => {
    if (!can(req.auth.role, 'admin.users')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    if (id === req.auth.userId) {
      return reply.code(400).send({
        error: { code: 'users.self_deactivate', message: 'You cannot change your own account status' },
      });
    }

    const body = req.body as { isActive?: boolean };
    if (typeof body.isActive !== 'boolean') {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'isActive (boolean) is required' },
      });
    }

    const statusResult = await req.withTenant(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id }, select: { id: true, isActive: true } });
      if (!existing) return null;

      const updated = await tx.user.update({
        where: { id },
        data: { isActive: body.isActive as boolean },
        select: { id: true, isActive: true },
      });

      if (!body.isActive) {
        await tx.session.deleteMany({ where: { userId: id } });
      }

      await tx.auditLog.create({
        data: {
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: body.isActive ? 'users.activate' : 'users.deactivate',
          entityType: 'User',
          entityId: id,
          diff: { before: { isActive: existing.isActive }, after: { isActive: body.isActive } },
        },
      });

      return updated;
    });

    if (!statusResult) {
      return reply.code(404).send({ error: { code: 'users.not_found', message: 'User not found' } });
    }

    const user = statusResult;

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, targetUserId: id, isActive: body.isActive },
      body.isActive ? 'users.activate' : 'users.deactivate',
    );

    return reply.send({ data: user });
  });
};
