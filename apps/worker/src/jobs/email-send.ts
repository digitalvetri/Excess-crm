import type { Job } from 'bullmq';
import axios from 'axios';
import pino from 'pino';
import { maskEmail } from '@excess/shared';

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

    case 'SEQUENCE_MESSAGE': {
      const escaped = (vars['body'] ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      return `<div style="font-family:sans-serif;line-height:1.5">${escaped}</div>`;
    }

    case 'CUSTOM_EMAIL':
      return `<div style="font-family:sans-serif;line-height:1.6;max-width:600px;margin:0 auto;color:#1a1a1a"><div style="background:#0F4C81;padding:20px 24px;border-radius:8px 8px 0 0"><h2 style="color:white;margin:0;font-size:18px">Excess Renew Tech</h2><p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px">Solar Energy Solutions</p></div><div style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">${(vars['body'] ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>')}<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/><p style="color:#94a3b8;font-size:12px;margin:0">Sent via Excess CRM &middot; Excess Renew Tech Pvt Ltd, Coimbatore</p></div></div>`;

    case 'PASSWORD_RESET':
      return `<div style="font-family:sans-serif;line-height:1.6;max-width:600px;margin:0 auto;color:#1a1a1a"><div style="background:#0F4C81;padding:20px 24px;border-radius:8px 8px 0 0"><h2 style="color:white;margin:0;font-size:18px">Excess CRM</h2><p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px">Password Reset</p></div><div style="padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px"><p>Hi ${vars['name'] ?? 'there'},</p><p>We received a request to reset your Excess CRM password. Click the button below to set a new password. This link expires in 1 hour.</p><div style="text-align:center;margin:32px 0"><a href="${vars['resetLink'] ?? ''}" style="background:#0F4C81;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Reset Password</a></div><p style="font-size:13px;color:#64748b">If you didn't request a password reset, you can safely ignore this email. Your password will not change.</p><hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/><p style="color:#94a3b8;font-size:12px;margin:0">Excess CRM &middot; Excess Renew Tech Pvt Ltd, Coimbatore</p></div></div>`;

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

    log.info({ tenantId, to: maskEmail(to), template }, 'email.sent');
  } catch (err) {
    log.error({ tenantId, to: maskEmail(to), template, err }, 'email.send_failed');
    throw err;
  }
}
