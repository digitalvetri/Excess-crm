import type { FastifyPluginAsync } from 'fastify';
import argon2 from 'argon2';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { nanoid } from 'nanoid';
import { prisma } from '@excess/db';
import { env } from '@excess/config';
import {
  loginSchema,
  totpVerifySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@excess/shared';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const loginAttempts = new Map<string, { count: number; firstAt: number }>();

function isLockedOut(email: string): boolean {
  const r = loginAttempts.get(email);
  if (!r) return false;
  if (Date.now() - r.firstAt > LOCKOUT_DURATION_MS) {
    loginAttempts.delete(email);
    return false;
  }
  return r.count >= LOCKOUT_ATTEMPTS;
}

function recordFail(email: string): void {
  const r = loginAttempts.get(email);
  if (!r || Date.now() - r.firstAt > LOCKOUT_DURATION_MS) {
    loginAttempts.set(email, { count: 1, firstAt: Date.now() });
  } else {
    r.count++;
  }
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /auth/login
  app.post('/login', { config: { public: true } }, async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { email, password } = parsed.data;

    if (isLockedOut(email)) {
      req.log.warn({ email }, 'login locked out');
      return reply.code(429).send({
        error: { code: 'auth.locked', message: 'Account locked — try again in 15 minutes' },
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: { select: { id: true, type: true, status: true } } },
    });

    if (!user?.isActive || !(await argon2.verify(user.passwordHash, password))) {
      recordFail(email);
      return reply.code(401).send({ error: { code: 'auth.invalid', message: 'Invalid credentials' } });
    }

    loginAttempts.delete(email);

    if (user.twoFactorSecret) {
      const preAuthToken = nanoid(48);
      // TODO: store preAuthToken → userId mapping in Redis (5-min TTL)
      return reply.send({ data: { requiresTwoFactor: true, preAuthToken } });
    }

    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await prisma.session.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        teamId: user.teamId,
        token,
        expiresAt,
      },
    });

    await Promise.all([
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: 'auth.login',
          entityType: 'User',
          entityId: user.id,
          diff: {},
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
        },
      }),
    ]);

    const isProduction = process.env['NODE_ENV'] === 'production';
    const domainOpt = isProduction ? { domain: env.COOKIE_DOMAIN } : {};

    reply.setCookie('excess_session', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      ...domainOpt,
      expires: expiresAt,
    });

    // Non-httpOnly cookie so Next.js middleware can read the role for route protection
    reply.setCookie('excess_role', user.role, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      ...domainOpt,
      expires: expiresAt,
    });

    return reply.send({
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          tenantType: user.tenant.type,
        },
      },
    });
  });

  // POST /auth/2fa/setup
  app.post('/2fa/setup', async (req, reply) => {
    const secret = speakeasy.generateSecret({
      name: `Excess CRM (${req.auth.userId})`,
      length: 32,
    });

    await prisma.user.update({
      where: { id: req.auth.userId },
      data: { twoFactorSecret: secret.base32 },
    });

    const otpUrl = secret.otpauth_url ?? '';
    const qrDataUrl = await qrcode.toDataURL(otpUrl);

    return reply.send({ data: { secret: secret.base32, qrDataUrl } });
  });

  // POST /auth/2fa/verify
  app.post('/2fa/verify', { config: { public: true } }, async (req, reply) => {
    const parsed = totpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }
    // TODO: validate preAuthToken from Redis, fetch userId, verify TOTP, create session
    return reply.code(501).send({ error: { code: 'not_implemented', message: 'Wire Redis preAuthToken store' } });
  });

  // POST /auth/logout
  app.post('/logout', async (req, reply) => {
    const token = req.cookies['excess_session'];
    if (token) await prisma.session.deleteMany({ where: { token } });
    const domainOpt = process.env['NODE_ENV'] === 'production' ? { domain: env.COOKIE_DOMAIN } : {};
    reply.clearCookie('excess_session', { path: '/', ...domainOpt });
    reply.clearCookie('excess_role', { path: '/', ...domainOpt });
    return reply.send({ data: { success: true } });
  });

  // GET /auth/me
  app.get('/me', async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: {
        id: true, name: true, email: true, phone: true, role: true,
        tenantId: true, teamId: true, isActive: true, lastLoginAt: true,
        tenant: { select: { id: true, name: true, type: true, status: true, tier: true } },
      },
    });

    if (!user) {
      return reply.code(404).send({ error: { code: 'user.not_found', message: 'User not found' } });
    }

    return reply.send({ data: user });
  });

  // POST /auth/forgot-password
  app.post('/forgot-password', { config: { public: true } }, async (req, reply) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid email' } });
    }
    req.log.info({ email: parsed.data.email }, 'password reset requested');
    // TODO: generate token, store in Redis 1h, send via Resend
    return reply.send({ data: { message: 'If that email is registered, a reset link has been sent.' } });
  });

  // POST /auth/reset-password
  app.post('/reset-password', { config: { public: true } }, async (req, reply) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }
    // TODO: validate token from Redis, hash new password, update user, delete token
    return reply.code(501).send({ error: { code: 'not_implemented', message: 'Wire Redis token validation' } });
  });
};
