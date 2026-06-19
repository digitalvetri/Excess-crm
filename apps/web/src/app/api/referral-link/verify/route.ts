import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get('leadId');
  const token = req.nextUrl.searchParams.get('token');

  if (!leadId || !token) {
    return NextResponse.json({ valid: false, leadId: '' }, { status: 400 });
  }

  const secret = process.env['SESSION_SECRET'] ?? 'dev-secret';
  const expected = createHmac('sha256', secret).update(leadId).digest('hex').substring(0, 16);
  const valid = expected === token;

  return NextResponse.json({ valid, leadId });
}
