import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '@excess/db';
import type { UserRole } from '@excess/db';
import { hashToken } from '../lib/token.js';

export interface RequestAuth {
  userId: string;
  tenantId: string;
  role: UserRole;
  teamId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: RequestAuth;
    rawBody?: string;
  }
  interface FastifyContextConfig {
    public?: boolean;
  }
}

const RENEW_THRESHOLD_DAYS = 7;
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

const authPluginImpl: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req: FastifyRequest, reply) => {
    if (req.routeOptions.config?.public) return;

    const token = req.cookies['excess_session'];
    if (!token) {
      return reply.code(401).send({
        error: { code: 'unauthenticated', message: 'Authentication required' },
      });
    }

    const session = await prisma.session.findUnique({
      where: { token: hashToken(token) },
      include: { user: { select: { isActive: true, role: true, teamId: true } } },
    });

    if (!session || session.expiresAt < new Date() || !session.user.isActive) {
      return reply.code(401).send({
        error: { code: 'session_invalid', message: 'Session invalid or expired' },
      });
    }

    // Read role/teamId from the LIVE user record (not the snapshot stored on the
    // session row) so a demoted or re-teamed user loses/gains access immediately.
    req.auth = {
      userId: session.userId,
      tenantId: session.tenantId,
      role: session.user.role,
      teamId: session.user.teamId,
    };

    const daysLeft = (session.expiresAt.getTime() - Date.now()) / 86_400_000;
    if (daysLeft < RENEW_THRESHOLD_DAYS) {
      await prisma.session.update({
        where: { id: session.id },
        data: { expiresAt: new Date(Date.now() + SESSION_DURATION_MS) },
      });
    }
  });
};

export const authPlugin = fp(authPluginImpl, { name: 'auth' });
