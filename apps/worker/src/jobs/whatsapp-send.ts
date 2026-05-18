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
}

export async function processWhatsappSend(job: Job<WhatsappSendPayload>): Promise<void> {
  const { tenantId, leadId, phone, template, vars } = job.data;

  const phoneNumberId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
  const accessToken = process.env['WHATSAPP_ACCESS_TOKEN'];

  if (!phoneNumberId || !accessToken) {
    throw new Error('Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
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
    await axios.post(url, body, { headers });

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
    log.error({ tenantId, leadId, template, err }, 'whatsapp.send_failed');
    throw err;
  }
}
