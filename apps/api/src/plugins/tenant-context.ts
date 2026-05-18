import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { withTenantContext, prisma } from '@excess/db';
import type { Prisma } from '@excess/db';

declare module 'fastify' {
  interface FastifyRequest {
    withTenant: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  }
}

const tenantContextPluginImpl: FastifyPluginAsync = async (app) => {
  app.decorateRequest('withTenant', null);

  app.addHook('preHandler', async (req) => {
    if (!req.auth) return;
    req.withTenant = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
      withTenantContext(prisma, req.auth, fn);
  });
};

export const tenantContextPlugin = fp(tenantContextPluginImpl, {
  name: 'tenant-context',
  dependencies: ['auth'],
});
