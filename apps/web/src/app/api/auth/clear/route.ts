import { NextResponse } from 'next/server';

// Clears session cookies and returns 200. The caller (api.ts interceptor or
// handleLogout) does the client-side redirect to /login after this fetch resolves.
// Keeping the redirect client-side avoids the internal container URL (0.0.0.0:3000)
// being used as the Location header when running behind a reverse proxy in Docker.
export function GET() {
  const res = new NextResponse(null, { status: 200 });
  res.cookies.delete('excess_session');
  res.cookies.delete('excess_role');
  return res;
}
