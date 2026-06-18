import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Evaluated at module-load time (server startup / first request) — NOT at build time.
// Set INTERNAL_API_URL in Coolify env vars for the web service.
// Local dev fallback: http://localhost:8000
const API_BASE = `${process.env.INTERNAL_API_URL ?? 'http://localhost:8000'}/api/v1`;

const DROP_REQ_HEADERS = new Set([
  'host', 'connection', 'keep-alive', 'transfer-encoding',
  'te', 'trailer', 'proxy-authorization', 'proxy-authenticate', 'upgrade',
]);

const DROP_RES_HEADERS = new Set([
  // Node.js fetch (undici) auto-decompresses; removing these prevents double-encoding
  'content-encoding', 'transfer-encoding',
]);

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const target = `${API_BASE}/${path.join('/')}${req.nextUrl.search}`;

  const fwdHeaders = new Headers();
  req.headers.forEach((v, k) => {
    if (!DROP_REQ_HEADERS.has(k)) fwdHeaders.set(k, v);
  });

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const body: BodyInit | null = hasBody ? await req.arrayBuffer() : null;

  let upstream: Response;
  try {
    upstream = await fetch(target, { method: req.method, headers: fwdHeaders, body });
  } catch {
    return NextResponse.json(
      { error: { code: 'gateway_error', message: 'API service unreachable' } },
      { status: 502 },
    );
  }

  const resHeaders = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!DROP_RES_HEADERS.has(k)) resHeaders.set(k, v);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
