import crypto from 'crypto';
import { env } from '@excess/config';

const NPS_KEY = crypto
  .createHmac('sha256', env.SESSION_SECRET)
  .update('excess-nps-token-v1')
  .digest();

export interface NpsTokenPayload {
  reviewId: string;
  leadId: string;
  tenantId: string;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export function signNpsToken(payload: NpsTokenPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig  = b64url(crypto.createHmac('sha256', NPS_KEY).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyNpsToken(token: string): NpsTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expected = b64url(crypto.createHmac('sha256', NPS_KEY).update(body).digest());
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as NpsTokenPayload;
    if (
      typeof payload.reviewId !== 'string' ||
      typeof payload.leadId   !== 'string' ||
      typeof payload.tenantId !== 'string'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
