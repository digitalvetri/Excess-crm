import { env } from '@excess/config';

export async function fireGoogleAdsConversion(lead: {
  id: string;
  phone: string | null;
  createdAt: Date;
}): Promise<void> {
  const measurementId = env.GA4_MEASUREMENT_ID;
  const apiSecret     = env.GA4_API_SECRET;

  if (!measurementId || !apiSecret) return;

  const body = JSON.stringify({
    client_id: lead.id,
    events: [{
      name: 'conversion',
      params: {
        currency: 'INR',
        value: 350000,
        transaction_id: lead.id,
      },
    }],
  });

  try {
    await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      },
    );
  } catch {
    // Non-blocking — conversion tracking failure must never interrupt the conversion flow
  }
}
