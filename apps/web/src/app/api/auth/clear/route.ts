import { NextResponse } from 'next/server';

// Clears session cookies and returns 200. The caller (api.ts interceptor or handleLogout)
// does the client-side redirect to /login after this fetch resolves. Keeping the redirect
// client-side avoids the internal container URL (0.0.0.0:3000) being used as the Location
// header when running behind a reverse proxy in Docker.
//
// A cookie is only deleted if the deletion's Domain matches how the cookie was set. To be
// bulletproof against a COOKIE_DOMAIN mismatch (which would otherwise strand the cookie and
// bounce /login → /dashboard in a reload loop), emit BOTH a host-scoped delete (no Domain)
// AND a Domain-scoped delete. Whichever matches removes the cookie; the other is a harmless
// no-op.
export function GET() {
  const isProduction = process.env['NODE_ENV'] === 'production';
  const cookieDomain = process.env['COOKIE_DOMAIN'];

  const base = 'Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  const secure = isProduction ? '; Secure' : '';

  const deletes = (name: string, httpOnly: boolean): string[] => {
    const ho = httpOnly ? '; HttpOnly' : '';
    const headers = [`${name}=; ${base}${ho}${secure}`]; // host-scoped (no Domain)
    if (cookieDomain) headers.push(`${name}=; ${base}; Domain=${cookieDomain}${ho}${secure}`);
    return headers;
  };

  const res = new NextResponse(null, { status: 200 });
  for (const header of [...deletes('excess_session', true), ...deletes('excess_role', false)]) {
    res.headers.append('Set-Cookie', header);
  }
  return res;
}
