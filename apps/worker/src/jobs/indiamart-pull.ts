import type { Job } from 'bullmq';
import { prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';
import { queues } from '../queues.js';

export interface IndiamartPullPayload {
  sourceId: string;
  tenantId: string;
}

interface IndiamartRow {
  UNIQUE_QUERY_ID?: string;
  SENDER_NAME?: string;
  SENDER_MOBILE?: string;
  SENDER_EMAIL?: string;
  SENDER_CITY?: string;
  QUERY_TIME?: string;
}

export async function processIndiamartPull(job: Job<IndiamartPullPayload>): Promise<void> {
  const { sourceId, tenantId } = job.data;

  const source = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
    tx.leadSource.findUnique({
      where: { id: sourceId },
      select: { id: true, isActive: true, config: true },
    }),
  );

  if (!source || !source.isActive) return;

  const cfg = source.config as Record<string, unknown>;
  const apiKey = cfg['apiKey'] as string | undefined;
  if (!apiKey) {
    await job.log('IndiaMART source has no apiKey configured');
    return;
  }

  const endTime   = new Date();
  const startTime = new Date(endTime.getTime() - 10 * 60 * 1000);

  const fmt = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);
  const url = `https://mapi.indiamart.com/wservce/crm/crmListing/v2/?glusr_crm_key=${encodeURIComponent(apiKey)}&start_time=${encodeURIComponent(fmt(startTime))}&end_time=${encodeURIComponent(fmt(endTime))}`;

  let rows: IndiamartRow[] = [];
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      await job.log(`IndiaMART API returned ${res.status}`);
      return;
    }
    const json = (await res.json()) as { Response?: IndiamartRow[]; STATUS?: number };
    rows = json.Response ?? [];
  } catch (err) {
    await job.log(`IndiaMART pull failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  await job.log(`IndiaMART pull: fetched ${rows.length} rows`);

  for (const row of rows) {
    if (!row.SENDER_MOBILE) continue;
    await queues.leadIngest.add('lead-ingest', {
      sourceType: 'INDIAMART',
      sourceId,
      tenantId,
      externalId: row.UNIQUE_QUERY_ID,
      name: row.SENDER_NAME ?? 'Unknown',
      phone: row.SENDER_MOBILE,
      email: row.SENDER_EMAIL,
      city: row.SENDER_CITY,
      rawData: row as Record<string, unknown>,
    });
  }
}
