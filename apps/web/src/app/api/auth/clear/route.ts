import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Clears session cookies and redirects to /login.
// Called when the Fastify API returns 401 with an invalid/expired session —
// JavaScript cannot delete httpOnly cookies, so this server-side route does it.
export function GET(request: NextRequest) {
  const loginUrl = new URL('/login', request.url);
  const res = NextResponse.redirect(loginUrl);
  res.cookies.delete('excess_session');
  res.cookies.delete('excess_role');
  return res;
}
