import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/2fa', '/portal'];

// Routes that are blocked for each role.
// Franchise (FRANCHISE_OWNER / FRANCHISE_USER) can only access leads,
// their own commissions/wallet/referrals, leaderboard, and knowledge-base.
const FRANCHISE_BLOCKED = [
  '/calls',
  '/appointments',
  '/quotations',
  '/projects',
  '/service-tickets',
  '/amc',
  '/whatsapp',
  '/broadcasts',
  '/reports',
  '/insights',
  '/franchise',
  '/payouts',
  '/teams',
  '/engagement',
  '/reviews',
  '/settings',
];

// Employees cannot access admin-only areas
const EMPLOYEE_BLOCKED = [
  '/franchise',
  '/payouts',
  '/settings',
  '/wallet',
  '/commissions',
];

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

  // Role-based route protection using the non-httpOnly excess_role cookie
  if (hasSession && !isPublic) {
    const role = request.cookies.get('excess_role')?.value;

    if (role === 'FRANCHISE_OWNER' || role === 'FRANCHISE_USER') {
      const blocked = FRANCHISE_BLOCKED.some((p) => pathname.startsWith(p));
      if (blocked) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
      }
    }

    if (role === 'EMPLOYEE') {
      const blocked = EMPLOYEE_BLOCKED.some((p) => pathname.startsWith(p));
      if (blocked) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|logo.jpeg|solar-hero.png|banner-hero.png).*)'],
};
