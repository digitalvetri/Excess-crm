import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get('leadId');
  if (!leadId) {
    return NextResponse.json({ error: 'leadId required' }, { status: 400 });
  }

  const secret = process.env['SESSION_SECRET'] ?? 'dev-secret';
  const token = createHmac('sha256', secret).update(leadId).digest('hex').substring(0, 16);
  const base = process.env['APP_URL'] ?? 'http://localhost:3000';
  const url = `${base}/refer/${leadId}-${token}`;

  return NextResponse.json({ token, url });
}
