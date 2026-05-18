import type { Job } from 'bullmq';
import axios from 'axios';
import pino from 'pino';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

export interface EmailSendPayload {
  tenantId: string;
  to: string;
  subject: string;
  template: string;
  vars: Record<string, string>;
}

function renderHtml(template: string, subject: string, vars: Record<string, string>): string {
  switch (template) {
    case 'AGENT_LEAD_ASSIGNED':
      return `<h2>New Lead Assigned</h2><p>Hi ${vars['agentName'] ?? ''}, a new converted lead has been assigned to you.</p><p><strong>Lead:</strong> ${vars['leadName'] ?? ''}</p><p><strong>Phone:</strong> ${vars['leadPhone'] ?? ''}</p><p><strong>City:</strong> ${vars['leadCity'] ?? ''}</p>`;

    case 'QUOTATION_SENT_CONFIRMATION':
      return `<h2>Quotation Sent</h2><p>Quotation has been sent to ${vars['leadName'] ?? ''} via ${vars['via'] ?? ''}</p>`;

    default:
      return `<h2>${subject}</h2><p>This is an automated notification from Excess CRM.</p>`;
  }
}

export async function processEmailSend(job: Job<EmailSendPayload>): Promise<void> {
  const { tenantId, to, subject, template, vars } = job.data;

  const resendApiKey = process.env['RESEND_API_KEY'];
  const fromEmail = process.env['FROM_EMAIL'] ?? 'noreply@excessindia.com';

  if (!resendApiKey) {
    throw new Error('Missing RESEND_API_KEY');
  }

  const html = renderHtml(template, subject, vars);

  try {
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: fromEmail,
        to,
        subject,
        html,
      },
      {
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    log.info({ tenantId, to, template }, 'email.sent');
  } catch (err) {
    log.error({ tenantId, to, template, err }, 'email.send_failed');
    throw err;
  }
}
