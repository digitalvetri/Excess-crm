import type { Job } from 'bullmq';
import axios from 'axios';
import pino from 'pino';
import { prisma, withSystemContext } from '@excess/db';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

export interface BroadcastSendPayload {
  broadcastId: string;
  recipientId: string;
  tenantId: string;
  leadId: string;
  phone: string;
  channel: string;
  templateName: string | null;
  templateParams: Record<string, string>;
  bodyText: string | null;
}

async function sendWhatsapp(
  tenantId: string,
  phone: string,
  templateName: string | null,
  templateParams: Record<string, string>,
  bodyText: string | null,
): Promise<void> {
  // Prefer per-tenant credentials from DB (same as the inbox/whatsapp-send job);
  // fall back to env vars so broadcasts use the tenant's own number.
  const dbConfig = await withSystemContext(prisma, tenantId, (tx) =>
    tx.whatsappConfig.findUnique({
      where: { tenantId },
      select: { phoneNumberId: true, accessToken: true, isConnected: true },
    }),
  );

  const phoneNumberId = (dbConfig?.isConnected && dbConfig.phoneNumberId) || process.env['WHATSAPP_PHONE_NUMBER_ID'];
  const accessToken = (dbConfig?.isConnected && dbConfig.accessToken) || process.env['WHATSAPP_ACCESS_TOKEN'];
  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp not connected — set credentials in Settings → WhatsApp or env vars');
  }

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  let body: unknown;
  if (templateName) {
    const parameters = Object.values(templateParams).map((value) => ({ type: 'text', text: value }));
    body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName.toLowerCase(),
        language: { code: 'en_IN' },
        components: [{ type: 'body', parameters }],
      },
    };
  } else {
    body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: bodyText ?? '' },
    };
  }

  await axios.post(url, body, { headers });
}

export async function processBroadcastSend(job: Job<BroadcastSendPayload>): Promise<void> {
  const { broadcastId, recipientId, tenantId, leadId, phone, channel, templateName, templateParams, bodyText } =
    job.data;

  // Skip if this recipient was already processed
  const recipient = await withSystemContext(prisma, tenantId, (tx) =>
    tx.broadcastRecipient.findUnique({ where: { id: recipientId }, select: { status: true } }),
  );
  if (!recipient || recipient.status !== 'PENDING') return;

  // Respect opt-out that may have been set after the broadcast started
  const lead = await withSystemContext(prisma, tenantId, (tx) =>
    tx.lead.findUnique({ where: { id: leadId }, select: { commsOptedOutAt: true } }),
  );
  if (lead?.commsOptedOutAt) {
    await withSystemContext(prisma, tenantId, (tx) =>
      tx.broadcastRecipient.update({ where: { id: recipientId }, data: { status: 'OPTED_OUT' } }),
    );
    await finalizeIfComplete(broadcastId, tenantId);
    return;
  }

  try {
    if (channel === 'WHATSAPP') {
      await sendWhatsapp(tenantId, phone, templateName, templateParams, bodyText);
    } else {
      throw new Error(`Unsupported broadcast channel: ${channel}`);
    }
    await withSystemContext(prisma, tenantId, async (tx) => {
      await tx.broadcastRecipient.update({
        where: { id: recipientId },
        data: { status: 'SENT', sentAt: new Date() },
      });
      await tx.broadcast.update({ where: { id: broadcastId }, data: { sentCount: { increment: 1 } } });
    });
    log.info({ tenantId, broadcastId, recipientId }, 'broadcast.recipient_sent');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'send failed';
    await withSystemContext(prisma, tenantId, async (tx) => {
      await tx.broadcastRecipient.update({
        where: { id: recipientId },
        data: { status: 'FAILED', error: message.slice(0, 480) },
      });
      await tx.broadcast.update({ where: { id: broadcastId }, data: { failedCount: { increment: 1 } } });
    });
    log.warn({ tenantId, broadcastId, recipientId, err: message }, 'broadcast.recipient_failed');
  }

  await finalizeIfComplete(broadcastId, tenantId);
}

async function finalizeIfComplete(broadcastId: string, tenantId: string): Promise<void> {
  const pending = await withSystemContext(prisma, tenantId, (tx) =>
    tx.broadcastRecipient.count({ where: { broadcastId, status: 'PENDING' } }),
  );
  if (pending > 0) return;

  await withSystemContext(prisma, tenantId, (tx) =>
    tx.broadcast.updateMany({
      where: { id: broadcastId, status: 'SENDING' },
      data: { status: 'SENT', completedAt: new Date() },
    }),
  );
  log.info({ tenantId, broadcastId }, 'broadcast.completed');
}
