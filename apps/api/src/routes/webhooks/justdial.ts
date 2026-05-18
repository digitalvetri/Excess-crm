import type { FastifyPluginAsync } from 'fastify';
import { prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';

interface JustDialLead {
  requestid?: string;
  name?: string;
  mobile?: string;
  email?: string;
  city?: string;
  secret?: string;
  key?: string;
}

export const justdialWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/justdial', { config: { public: true } }, async (req, reply) => {
    const body = req.body as JustDialLead;
    const incomingKey = body.key ?? body.secret ?? '';

    // Cross-tenant admin lookup — source key identifies tenant
    const sources = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
      tx.leadSource.findMany({
        where: { type: 'JUSTDIAL', isActive: true },
        select: { id: true, tenantId: true, config: true },
      }),
    );

    const source = sources.find((s) => {
      const cfg = s.config as Record<string, unknown>;
      return cfg['secret'] === incomingKey || cfg['apiKey'] === incomingKey;
    });

    if (!source) {
      req.log.warn({ key: incomingKey }, 'Unknown JustDial source key');
      return reply.code(200).send('ok');
    }

    if (!body.mobile) return reply.code(200).send('ok');

    await req.server.queues.leadIngest.add('lead-ingest', {
      sourceType: 'JUSTDIAL',
      sourceId: source.id,
      tenantId: source.tenantId,
      externalId: body.requestid,
      name: body.name ?? 'Unknown',
      phone: body.mobile,
      email: body.email,
      city: body.city,
      rawData: body as Record<string, unknown>,
    });

    return reply.code(200).send('ok');
  });
};
