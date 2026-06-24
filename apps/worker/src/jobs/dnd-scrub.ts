/**
 * DND Scrub Worker — TRAI compliance
 *
 * TRAI mandates that all outbound call lists be scrubbed against the National
 * Customer Preference Register (NCPR / DND registry) before dialing.
 *
 * This worker handles three modes:
 *   - 'weekly-lead-scrub': checks all active lead phones via the Exotel DND API.
 *     Scheduled every Sunday at midnight IST by daily-scheduler.
 *   - 'exotel-batch': checks an explicit list of phones via the Exotel DND API.
 *     Used for on-demand checks (e.g., after a CSV import).
 *   - 'manual-import': directly upserts a provided list of numbers into dnd_list.
 *     Used when the operator receives a DND list from their telecom provider.
 *
 * Numbers confirmed to be on DND are upserted into the dnd_list table.
 * The lead-ingest worker and voice-dial worker both check this table before dialing.
 */

import type { Job } from 'bullmq';
import pino from 'pino';
import { prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';
import { env } from '@excess/config';
import { maskPhone } from '@excess/shared';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

// ─── Payload types ─────────────────────────────────────────────────────────────

export type DndScrubPayload =
  | { mode: 'weekly-lead-scrub' }
  | { mode: 'exotel-batch'; phones: string[] }
  | { mode: 'manual-import'; numbers: string[]; reason?: string };

// ─── Exotel DND API ────────────────────────────────────────────────────────────

interface ExotelDndResponse {
  IsDND: 'true' | 'false';
  Phone: string;
}

/**
 * Check a single phone number against the Exotel DND API.
 * Returns true if the number is on the DND registry, false otherwise.
 * Returns null if Exotel is not configured or the API call fails.
 */
async function checkExotelDnd(phone: string): Promise<boolean | null> {
  if (
    !env.EXOTEL_ACCOUNT_SID ||
    !env.EXOTEL_API_KEY ||
    !env.EXOTEL_API_TOKEN ||
    !env.EXOTEL_SUBDOMAIN
  ) {
    return null; // Exotel not configured — caller handles this
  }

  const url = `https://${env.EXOTEL_SUBDOMAIN}.exotel.com/v1/Accounts/${env.EXOTEL_ACCOUNT_SID}/DND/Check/${encodeURIComponent(phone)}.json`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.EXOTEL_API_KEY}:${env.EXOTEL_API_TOKEN}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      log.warn({ phone: maskPhone(phone), status: res.status }, 'dnd_scrub.exotel_api_error');
      return null;
    }

    const data = await res.json() as ExotelDndResponse;
    return data.IsDND === 'true';
  } catch {
    return null;
  }
}

/**
 * Check a batch of phones via the Exotel DND API (sequentially with a small
 * inter-request delay to stay within Exotel's rate limit of ~10 req/sec).
 * Returns the subset of phones confirmed to be on DND.
 */
async function batchExotelCheck(phones: string[], jobLogger: (msg: string) => Promise<void>): Promise<string[]> {
  const isExotelConfigured =
    env.EXOTEL_ACCOUNT_SID &&
    env.EXOTEL_API_KEY &&
    env.EXOTEL_API_TOKEN &&
    env.EXOTEL_SUBDOMAIN;

  if (!isExotelConfigured) {
    await jobLogger('Exotel not configured (EXOTEL_ACCOUNT_SID/API_KEY/API_TOKEN/SUBDOMAIN missing) — DND check skipped. Configure Exotel credentials to enable TRAI DND scrubbing.');
    return [];
  }

  const dndNumbers: string[] = [];
  let apiErrors = 0;

  for (const phone of phones) {
    const isDnd = await checkExotelDnd(phone);

    if (isDnd === true) {
      dndNumbers.push(phone);
    } else if (isDnd === null) {
      apiErrors++;
    }

    // ~5 req/sec — conservative to avoid rate limiting
    await new Promise<void>((r) => setTimeout(r, 200));
  }

  if (apiErrors > 0) {
    await jobLogger(`${apiErrors}/${phones.length} Exotel API calls failed — those numbers were not scrubbed`);
  }

  return dndNumbers;
}

/**
 * Upsert a list of confirmed DND numbers into the dnd_list table.
 * Uses createMany with skipDuplicates so re-runs are idempotent.
 */
async function upsertDndNumbers(phones: string[], reason: string): Promise<number> {
  if (phones.length === 0) return 0;

  const result = await prisma.dndList.createMany({
    data: phones.map((phone) => ({ phone, reason })),
    skipDuplicates: true,
  });

  return result.count;
}

// ─── Mode handlers ─────────────────────────────────────────────────────────────

async function handleWeeklyLeadScrub(jobLogger: (msg: string) => Promise<void>): Promise<void> {
  await jobLogger('Starting weekly DND lead scrub');

  // Scrub all lead phones active in the last 90 days that are not already on the DND list.
  // 90 days covers all leads that might still be called (retry cadence max ~30 days).
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [allLeadPhones, existingDnd] = await Promise.all([
    withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
      tx.lead.findMany({
        where: {
          createdAt: { gte: cutoff },
          phone: { not: '' },
          stage: { notIn: ['CONVERTED', 'INVALID', 'WRONG_ENQUIRY'] },
        },
        select: { phone: true },
        distinct: ['phone'],
      }),
    ),
    prisma.dndList.findMany({ select: { phone: true } }),
  ]);

  const existingDndSet = new Set(existingDnd.map((d) => d.phone));
  const phonesToCheck = [...new Set(allLeadPhones.map((l) => l.phone))].filter(
    (p) => !existingDndSet.has(p),
  );

  await jobLogger(`Found ${phonesToCheck.length} phones to check (${existingDndSet.size} already on DND list)`);

  if (phonesToCheck.length === 0) {
    await jobLogger('No new phones to scrub — done');
    return;
  }

  // Process in batches of 50 so the job logs progress and doesn't time out
  const BATCH_SIZE = 50;
  let totalNewDnd = 0;

  for (let i = 0; i < phonesToCheck.length; i += BATCH_SIZE) {
    const batch = phonesToCheck.slice(i, i + BATCH_SIZE);
    const dndNumbers = await batchExotelCheck(batch, jobLogger);
    const added = await upsertDndNumbers(dndNumbers, 'TRAI NCPR via Exotel DND API (weekly scrub)');

    totalNewDnd += added;
    await jobLogger(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: checked ${batch.length}, found ${dndNumbers.length} DND, added ${added} new`);
  }

  await jobLogger(`Weekly DND scrub complete — ${totalNewDnd} new DND numbers added to dnd_list`);
  log.info({ totalNewDnd, checked: phonesToCheck.length }, 'dnd_scrub.weekly_complete');
}

async function handleExotelBatch(
  phones: string[],
  jobLogger: (msg: string) => Promise<void>,
): Promise<void> {
  await jobLogger(`Starting Exotel DND batch check for ${phones.length} phones`);

  const uniquePhones = [...new Set(phones.filter(Boolean))];
  const dndNumbers = await batchExotelCheck(uniquePhones, jobLogger);
  const added = await upsertDndNumbers(dndNumbers, 'TRAI NCPR via Exotel DND API (on-demand batch)');

  await jobLogger(`Done — ${dndNumbers.length} DND numbers found, ${added} new entries added`);
  log.info({ checked: uniquePhones.length, dndCount: dndNumbers.length, added }, 'dnd_scrub.batch_complete');
}

async function handleManualImport(
  numbers: string[],
  reason: string | undefined,
  jobLogger: (msg: string) => Promise<void>,
): Promise<void> {
  const uniqueNumbers = [...new Set(numbers.filter(Boolean))];
  await jobLogger(`Manual DND import: ${uniqueNumbers.length} numbers`);

  const added = await upsertDndNumbers(
    uniqueNumbers,
    reason ?? 'Manual import by operator',
  );

  await jobLogger(`Done — ${added} new DND numbers added (${uniqueNumbers.length - added} were already present)`);
  log.info({ provided: uniqueNumbers.length, added }, 'dnd_scrub.manual_import_complete');
}

// ─── Main processor ───────────────────────────────────────────────────────────

export async function processDndScrub(job: Job<DndScrubPayload>): Promise<void> {
  const jobLogger = async (msg: string): Promise<void> => { await job.log(msg); };

  switch (job.data.mode) {
    case 'weekly-lead-scrub':
      await handleWeeklyLeadScrub(jobLogger);
      break;
    case 'exotel-batch':
      await handleExotelBatch(job.data.phones, jobLogger);
      break;
    case 'manual-import':
      await handleManualImport(job.data.numbers, job.data.reason, jobLogger);
      break;
    default: {
      // TypeScript exhaustiveness check
      const _never: never = job.data;
      log.error({ data: _never }, 'dnd_scrub.unknown_mode');
    }
  }
}
