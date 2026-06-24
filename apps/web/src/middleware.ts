import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/2fa', '/portal', '/refer'];

// ── Per-role page allowlist (default-deny) ───────────────────────────────────
// NOTE: this is a UX layer, not the security boundary. The excess_role cookie is
// readable/spoofable in the browser; the REAL enforcement is the `can()` check on
// every API route (derived from the server-side session). This list just keeps
// each role from landing on pages with no content for them.
//
// Each role's allowlist is the set of top-level routes its sidebar nav links to,
// PLUS the redirect targets (/referrals, /leaderboard, /wallet → /engagement) and
// /dashboard. A path is allowed if it equals an entry or is nested under it.
//
// ADMIN and any unrecognized role are NOT restricted here (admin sees everything;
// an unknown/missing role — e.g. a cookie-domain hiccup — falls through to the API
// checks rather than being locked out, avoiding redirect loops).
const ROLE_ALLOWED: Record<string, string[]> = {
  EMPLOYEE: [
    '/dashboard', '/leads', '/calls', '/appointments', '/quotations',
    '/projects', '/service-tickets', '/amc', '/whatsapp', '/broadcasts',
    '/reports', '/insights', '/engagement', '/referrals', '/leaderboard',
    '/reviews', '/knowledge-base',
  ],
  FRANCHISE_OWNER: [
    '/dashboard', '/leads', '/commissions', '/wallet', '/referrals',
    '/leaderboard', '/engagement', '/knowledge-base',
  ],
  FRANCHISE_USER: [
    '/dashboard', '/leads', '/referrals', '/leaderboard', '/engagement',
    '/knowledge-base',
  ],
  ENGINEER: [
    '/dashboard', '/appointments', '/projects', '/service-tickets',
    '/knowledge-base',
  ],
};

function isAllowed(allowed: string[], pathname: string): boolean {
  return allowed.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const hasSession = request.cookies.has('excess_session');

  if (!isPublic && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (isPublic && hasSession && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Role-based page allowlist (UX layer; API `can()` is the real boundary).
  if (hasSession && !isPublic) {
    const role = request.cookies.get('excess_role')?.value;
    const allowed = role ? ROLE_ALLOWED[role] : undefined;
    // Only the four non-admin roles are restricted; ADMIN/unknown pass through.
    if (allowed && !isAllowed(allowed, pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|logo.jpeg|solar-hero.png).*)'],
};
