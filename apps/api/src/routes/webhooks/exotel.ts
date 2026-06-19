import { createHmac, timingSafeEqual } from 'crypto';
import type { FastifyPluginAsync } from 'fastify';
import { prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';
import { env } from '@excess/config';

interface ExotelMissedCallPayload {
  CallSid?: string;
  From?: string;
  To?: string;
  Status?: string;
  CallType?: string;
}

function verifyExotelSignature(secret: string, body: string, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(signature, 'utf8'));
  } catch {
    return false;
  }
}

export const exotelWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/exotel/missed-call', { config: { public: true } }, async (req, reply) => {
    // Signature check — always enforced; fail closed if the secret is unconfigured
    const secret = env.EXOTEL_WEBHOOK_SECRET;
    if (!secret) {
      req.log.error('exotel.missed_call.secret_not_configured');
      return reply.code(200).send('ok');
    }
    const sig = (req.headers['x-exotel-signature'] as string) ?? '';
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (!verifyExotelSignature(secret, raw, sig)) {
      req.log.warn('exotel.missed_call.invalid_signature');
      return reply.code(200).send('ok');
    }

    const payload = req.body as ExotelMissedCallPayload;
    const callerPhone = payload.From;
    const calledNumber = payload.To;
    const callSid = payload.CallSid;
    const status = payload.Status?.toLowerCase();

    // Only process missed/no-answer calls; discard answered calls and unknown payloads
    if (!status || !['no-answer', 'missed', 'busy', 'failed'].includes(status)) {
      return reply.code(200).send('ok');
    }

    if (!callerPhone) {
      req.log.warn({ callSid }, 'exotel.missed_call.no_caller_phone');
      return reply.code(200).send('ok');
    }

    // Find the tenant by matching their PHONE_INBOUND source virtual number
    const sources = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
      tx.leadSource.findMany({
        where: { type: 'PHONE_INBOUND', isActive: true },
        select: { id: true, tenantId: true, config: true },
      }),
    );

    // Match tenant by Exotel virtual number config
    let tenantId: string | null = null;
    let sourceId: string | null = null;

    for (const s of sources) {
      const cfg = s.config as Record<string, unknown>;
      if (cfg['exotelVirtualNumber'] === calledNumber || calledNumber === env.EXOTEL_VIRTUAL_NUMBER) {
        tenantId = s.tenantId;
        sourceId = s.id;
        break;
      }
    }

    if (!tenantId) {
      req.log.warn({ callSid, calledNumber }, 'exotel.missed_call.no_tenant_found');
      return reply.code(200).send('ok');
    }

    await req.server.queues.leadIngest.add('lead-ingest', {
      sourceType: 'PHONE_INBOUND',
      sourceId: sourceId ?? undefined,
      tenantId,
      externalId: callSid,
      name: callerPhone,
      phone: callerPhone,
      rawData: {
        exotelCallSid: callSid,
        calledNumber,
        status: payload.Status,
        callType: payload.CallType,
      },
    });

    req.log.info({ tenantId, callSid }, 'exotel.missed_call.queued');
    return reply.code(200).send('ok');
  });
};
