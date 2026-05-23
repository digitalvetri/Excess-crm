import { createHmac } from 'crypto';
import type { PrismaClient } from '@excess/db';

export async function fireWebhooks(
  prisma: PrismaClient,
  tenantId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId, isActive: true, events: { has: event } },
    select: { id: true, url: true, secret: true },
  });

  if (endpoints.length === 0) return;

  const body = JSON.stringify({ event, tenantId, data: payload, timestamp: new Date().toISOString() });

  await Promise.allSettled(
    endpoints.map(async (ep) => {
      const sig = createHmac('sha256', ep.secret).update(body).digest('hex');
      const start = Date.now();
      let statusCode: number | null = null;
      let success = false;
      let error: string | undefined;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(ep.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Excess-Signature': `sha256=${sig}`,
            'X-Excess-Event': event,
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        statusCode = res.status;
        success = res.status >= 200 && res.status < 300;
      } catch (err) {
        error = err instanceof Error ? err.message : 'Request failed';
      }

      await prisma.webhookDelivery.create({
        data: {
          endpointId: ep.id,
          event,
          payload: payload as object,
          statusCode,
          responseMs: Date.now() - start,
          success,
          ...(error && { error }),
        },
      });
    }),
  );
}
