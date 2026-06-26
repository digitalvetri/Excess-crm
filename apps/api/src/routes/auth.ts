import type { FastifyPluginAsync } from 'fastify';
import argon2 from 'argon2';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { nanoid } from 'nanoid';
import { prisma } from '@excess/db';
import { hashToken } from '../lib/token.js';
import type { UserRole } from '@excess/db';
import { env } from '@excess/config';
import {
  loginSchema,
  totpVerifySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  maskEmail,
} from '@excess/shared';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_DURATION_SEC = 15 * 60;

// Redis-backed brute-force protection — survives restarts and works across multiple API instances
async function isLockedOut(redis: import('ioredis').Redis, email: string): Promise<boolean> {
  const count = await redis.get(`lockout:${email}`);
  return count !== null && parseInt(count, 10) >= LOCKOUT_ATTEMPTS;
}

async function recordFail(redis: import('ioredis').Redis, email: string): Promise<void> {
  const key = `lockout:${email}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, LOCKOUT_DURATION_SEC);
  }
}

async function clearLockout(redis: import('ioredis').Redis, email: string): Promise<void> {
  await redis.del(`lockout:${email}`);
}

// Fixed dummy hash so the user-not-found / inactive login path still spends an argon2
// verify — otherwise a missing email returns faster than a wrong password, leaking which
// emails exist (timing oracle). Computed once, lazily.
let dummyHashCache: string | undefined;
async function dummyHash(): Promise<string> {
  if (!dummyHashCache) dummyHashCache = await argon2.hash('argon2-timing-equalizer');
  return dummyHashCache;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  function setSessionCookies(
    reply: { setCookie: (name: string, value: string, opts: object) => void },
    token: string,
    role: UserRole,
    expiresAt: Date,
  ) {
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

    // Non-httpOnly so Next.js middleware can read role for client-side route hints.
    // DISPLAY-ONLY: this cookie is NOT an authorization boundary — it's trivially
    // forgeable. The API always re-derives the role from the hashed httpOnly session
    // (see plugins/auth.ts); never trust excess_role for any access decision.
    reply.setCookie('excess_role', role, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      ...domainOpt,
      expires: expiresAt,
    });
  }

  async function createSession(userId: string, tenantId: string, role: UserRole, teamId: string | null) {
    const raw = nanoid(32);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    // Store the hash; the raw token goes to the cookie only.
    await prisma.session.create({ data: { userId, tenantId, role, teamId, token: hashToken(raw), expiresAt } });
    return { token: raw, expiresAt };
  }

  // POST /auth/login
  app.post('/login', { config: { public: true, rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { email, password } = parsed.data;

    if (await isLockedOut(app.redis, email)) {
      req.log.warn({ email: maskEmail(email) }, 'login locked out');
      return reply.code(429).send({
        error: { code: 'auth.locked', message: 'Account locked — try again in 15 minutes' },
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: { select: { id: true, type: true, status: true } } },
    });

    // Run an argon2 verify on BOTH the missing/inactive-user path (against a dummy hash)
    // and the real path, so response time doesn't reveal whether the email exists.
    if (!user?.isActive) {
      await argon2.verify(await dummyHash(), password).catch(() => undefined);
      await recordFail(app.redis, email);
      return reply.code(401).send({ error: { code: 'auth.invalid', message: 'Invalid credentials' } });
    }
    if (!(await argon2.verify(user.passwordHash, password))) {
      await recordFail(app.redis, email);
      return reply.code(401).send({ error: { code: 'auth.invalid', message: 'Invalid credentials' } });
    }

    await clearLockout(app.redis, email);

    if (user.twoFactorSecret) {
      const preAuthToken = nanoid(48);
      await app.redis.setex(
        `preauth:${preAuthToken}`,
        300,
        JSON.stringify({ userId: user.id, tenantId: user.tenantId, role: user.role, teamId: user.teamId }),
      );
      return reply.send({ data: { requiresTwoFactor: true, preAuthToken } });
    }

    const { token, expiresAt } = await createSession(user.id, user.tenantId, user.role, user.teamId);

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

    setSessionCookies(reply, token, user.role, expiresAt);

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
  app.post('/2fa/verify', { config: { public: true, rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const parsed = totpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }

    const { preAuthToken, code } = parsed.data;

    const stored = await app.redis.get(`preauth:${preAuthToken}`);
    if (!stored) {
      return reply.code(401).send({
        error: { code: 'auth.2fa_expired', message: 'Session expired — please log in again' },
      });
    }

    const { userId, tenantId, role, teamId } = JSON.parse(stored) as {
      userId: string;
      tenantId: string;
      role: UserRole;
      teamId: string | null;
    };

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, isActive: true, name: true, email: true },
    });

    if (!user?.isActive || !user.twoFactorSecret) {
      await app.redis.del(`preauth:${preAuthToken}`);
      return reply.code(401).send({ error: { code: 'auth.invalid', message: 'Invalid session' } });
    }

    const valid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!valid) {
      return reply.code(401).send({
        error: { code: 'auth.2fa_invalid', message: 'Invalid or expired 2FA code' },
      });
    }

    await app.redis.del(`preauth:${preAuthToken}`);

    const { token, expiresAt } = await createSession(userId, tenantId, role, teamId);

    await Promise.all([
      prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId: userId,
          action: 'auth.login_2fa',
          entityType: 'User',
          entityId: userId,
          diff: {},
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
        },
      }),
    ]);

    setSessionCookies(reply, token, role, expiresAt);

    return reply.send({
      data: {
        user: { id: userId, name: user.name, email: user.email, role, tenantId },
      },
    });
  });

  // POST /auth/logout
  app.post('/logout', async (req, reply) => {
    const token = req.cookies['excess_session'];
    if (token) await prisma.session.deleteMany({ where: { token: hashToken(token) } });
    const isProduction = process.env['NODE_ENV'] === 'production';
    const domainOpt = isProduction ? { domain: env.COOKIE_DOMAIN } : {};
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
  app.post('/forgot-password', { config: { public: true, rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid email' } });
    }

    const { email } = parsed.data;
    req.log.info({ email: maskEmail(email) }, 'password reset requested');

    // Always respond with success to prevent email enumeration
    const SAFE_RESPONSE = { data: { message: 'If that email is registered, a reset link has been sent.' } };

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, isActive: true },
    });

    if (!user?.isActive) {
      return reply.send(SAFE_RESPONSE);
    }

    const resetToken = nanoid(32);
    // Store under the hash; the raw token goes only in the emailed link.
    await app.redis.setex(`reset:${hashToken(resetToken)}`, 3600, email);

    const resetLink = `${env.APP_URL}/reset-password?token=${resetToken}`;

    await app.queues.emailSend.add('password-reset', {
      tenantId: 'system',
      to: email,
      subject: 'Reset your Excess CRM password',
      template: 'PASSWORD_RESET',
      vars: { name: user.name ?? 'User', resetLink },
    });

    return reply.send(SAFE_RESPONSE);
  });

  // POST /auth/reset-password
  app.post('/reset-password', { config: { public: true, rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input' } });
    }

    const { token, password } = parsed.data;

    const email = await app.redis.get(`reset:${hashToken(token)}`);
    if (!email) {
      return reply.code(400).send({
        error: { code: 'auth.reset_invalid', message: 'Reset link is invalid or has expired' },
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, tenantId: true },
    });

    if (!user) {
      return reply.code(400).send({
        error: { code: 'auth.reset_invalid', message: 'Reset link is invalid or has expired' },
      });
    }

    const passwordHash = await argon2.hash(password);

    await Promise.all([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      app.redis.del(`reset:${hashToken(token)}`),
      prisma.auditLog.create({
        data: {
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: 'auth.password_reset',
          entityType: 'User',
          entityId: user.id,
          diff: {},
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
        },
      }),
    ]);

    // Invalidate all active sessions for security
    await prisma.session.deleteMany({ where: { userId: user.id } });

    req.log.info({ userId: user.id }, 'auth.password_reset_complete');
    return reply.send({ data: { success: true } });
  });
};
