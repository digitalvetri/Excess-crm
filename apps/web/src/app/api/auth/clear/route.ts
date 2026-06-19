import { NextResponse } from 'next/server';

// Clears session cookies and returns 200. The caller (api.ts interceptor or
// handleLogout) does the client-side redirect to /login after this fetch resolves.
// Keeping the redirect client-side avoids the internal container URL (0.0.0.0:3000)
// being used as the Location header when running behind a reverse proxy in Docker.
//
// IMPORTANT: cookies must be deleted with the same domain/secure/path they were set
// with, otherwise the browser ignores the deletion. COOKIE_DOMAIN must be set in the
// web service env (same value as the API service) for production deletion to work.
export function GET() {
  const res = new NextResponse(null, { status: 200 });

  const isProduction = process.env['NODE_ENV'] === 'production';
  const cookieDomain = process.env['COOKIE_DOMAIN'];
  const domainOpt = isProduction && cookieDomain ? { domain: cookieDomain } : {};

  const baseOpts = {
    path: '/',
    maxAge: 0,
    ...domainOpt,
  };

  res.cookies.set('excess_session', '', { ...baseOpts, httpOnly: true, secure: isProduction, sameSite: 'lax' });
  res.cookies.set('excess_role', '', { ...baseOpts, httpOnly: false, secure: isProduction, sameSite: 'lax' });

  return res;
}
