import crypto from 'crypto';
import { env } from '@excess/config';

// Domain-separated signing key derived from SESSION_SECRET — never equal to it,
// so a portal-token forgery primitive can never relate to session forgery.
const PORTAL_KEY = crypto
  .createHmac('sha256', env.SESSION_SECRET)
  .update('excess-portal-token-v1')
  .digest();

const TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

export interface PortalPayload {
  projectId: string;
  tenantId: string;
  exp: number;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

export function signPortalToken(projectId: string, tenantId: string): string {
  const payload: PortalPayload = { projectId, tenantId, exp: Date.now() + TTL_MS };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac('sha256', PORTAL_KEY).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyPortalToken(token: string): PortalPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expected = b64url(crypto.createHmac('sha256', PORTAL_KEY).update(body).digest());
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as PortalPayload;
    if (
      typeof payload.exp !== 'number' ||
      payload.exp < Date.now() ||
      typeof payload.projectId !== 'string' ||
      typeof payload.tenantId !== 'string'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
