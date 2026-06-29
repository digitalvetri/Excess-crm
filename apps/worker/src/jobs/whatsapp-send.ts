import type { Job } from 'bullmq';
import axios from 'axios';
import pino from 'pino';
import { prisma, withSystemContext } from '@excess/db';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

export interface WhatsappSendPayload {
  tenantId: string;
  leadId: string;
  phone: string;
  template: string;
  vars: Record<string, string>;
  /** WhatsApp message id (wamid) to reply to, for Meta's quoted-reply context. */
  contextWaId?: string;
  /** Outbound LeadActivity id whose delivery status this send should update. */
  activityId?: string;
}

/** Merge fields into a LeadActivity's JSON payload without clobbering it. */
async function patchActivityPayload(
  tenantId: string,
  activityId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await withSystemContext(prisma, tenantId, async (tx) => {
    const activity = await tx.leadActivity.findUnique({
      where: { id: activityId },
      select: { payload: true },
    });
    if (!activity) return;
    const current = (activity.payload ?? {}) as Record<string, unknown>;
    await tx.leadActivity.update({
      where: { id: activityId },
      data: { payload: { ...current, ...patch } as object },
    });
  });
}

export async function processWhatsappSend(job: Job<WhatsappSendPayload>): Promise<void> {
  const { tenantId, leadId, phone, template, vars, contextWaId, activityId } = job.data;

  // Prefer per-tenant credentials from DB; fall back to env vars
  const dbConfig = await withSystemContext(prisma, tenantId, (tx) =>
    tx.whatsappConfig.findUnique({
      where:  { tenantId },
      select: { phoneNumberId: true, accessToken: true, isConnected: true },
    }),
  );

  const phoneNumberId = (dbConfig?.isConnected && dbConfig.phoneNumberId) || process.env['WHATSAPP_PHONE_NUMBER_ID'];
  const accessToken   = (dbConfig?.isConnected && dbConfig.accessToken)   || process.env['WHATSAPP_ACCESS_TOKEN'];

  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp not connected — set credentials in Settings → WhatsApp or env vars');
  }

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  let body: unknown;

  if (template === 'DIRECT_MESSAGE') {
    body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: vars['message'] ?? '' },
      ...(contextWaId ? { context: { message_id: contextWaId } } : {}),
    };
  } else if (template === 'REACTION') {
    body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'reaction',
      reaction: { message_id: vars['waId'] ?? '', emoji: vars['emoji'] ?? '' },
    };
  } else if (template === 'MEDIA') {
    const mediaType = vars['mediaType'] || 'document';
    const mediaObject: Record<string, string> = { id: vars['mediaId'] ?? '' };
    if (vars['caption']) mediaObject['caption'] = vars['caption'];
    if (mediaType === 'document' && vars['filename']) mediaObject['filename'] = vars['filename'];
    body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: mediaType,
      [mediaType]: mediaObject,
    };
  } else {
    const parameters = Object.values(vars).map((value) => ({
      type: 'text',
      text: value,
    }));

    body = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: template.toLowerCase(),
        language: { code: 'en_IN' },
        components: [
          {
            type: 'body',
            parameters,
          },
        ],
      },
    };
  }

  try {
    const res = await axios.post<{ messages?: { id?: string }[] }>(url, body, { headers });
    const waMessageId = res.data?.messages?.[0]?.id;

    // Flip the activity to 'sent' and store the wamid FIRST so Meta status
    // callbacks (sent/delivered/read) can match this message immediately.
    if (activityId) {
      await patchActivityPayload(tenantId, activityId, {
        deliveryStatus: 'sent',
        ...(waMessageId ? { waMessageId } : {}),
      });
    }

    const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h window
    await withSystemContext(prisma, tenantId, (tx) =>
      tx.waSession.upsert({
        where: { tenantId_phone: { tenantId, phone } },
        update: { lastMessageAt: new Date() },
        create: { tenantId, leadId, phone, lastMessageAt: new Date(), sessionExpiresAt: sessionExpiry },
      }),
    );

    log.info({ tenantId, leadId, template }, 'whatsapp.sent');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'WhatsApp send failed';
    if (activityId) {
      await patchActivityPayload(tenantId, activityId, {
        deliveryStatus: 'failed',
        deliveryError: message.slice(0, 480),
      }).catch(() => {});
    }
    log.error({ tenantId, leadId, template, err }, 'whatsapp.send_failed');
    throw err;
  }
}
