import type { FastifyPluginAsync } from 'fastify';
import { prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';

interface IndiamartLead {
  UNIQUE_QUERY_ID?: string;
  SENDER_NAME?: string;
  SENDER_MOBILE?: string;
  SENDER_EMAIL?: string;
  SENDER_CITY?: string;
}

export const indiamartWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/indiamart', { config: { public: true } }, async (req, reply) => {
    const q = req.query as Record<string, string>;
    const incomingKey = q['key'] ?? '';

    // Find tenant by matching apiKey stored in config JSON — cross-tenant admin lookup
    const sources = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
      tx.leadSource.findMany({
        where: { type: 'INDIAMART', isActive: true },
        select: { id: true, tenantId: true, config: true },
      }),
    );

    const source = sources.find((s) => {
      const cfg = s.config as Record<string, unknown>;
      return cfg['apiKey'] === incomingKey;
    });

    if (!source) {
      req.log.warn({ key: incomingKey }, 'Unknown IndiaMART API key');
      return reply.code(200).send('ok');
    }

    const body = req.body as IndiamartLead | IndiamartLead[];
    const leads = Array.isArray(body) ? body : [body];

    for (const lead of leads) {
      if (!lead.SENDER_MOBILE) continue;
      await req.server.queues.leadIngest.add('lead-ingest', {
        sourceType: 'INDIAMART',
        sourceId: source.id,
        tenantId: source.tenantId,
        externalId: lead.UNIQUE_QUERY_ID,
        name: lead.SENDER_NAME ?? 'Unknown',
        phone: lead.SENDER_MOBILE,
        email: lead.SENDER_EMAIL,
        city: lead.SENDER_CITY,
        rawData: lead as Record<string, unknown>,
      });
    }

    return reply.code(200).send('ok');
  });
};
