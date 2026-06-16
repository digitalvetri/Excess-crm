import { Worker, type Job } from 'bullmq';
import pino from 'pino';
import { redis } from './redis.js';
import { processLeadIngest } from './jobs/lead-ingest.js';
import { processVoiceDial } from './jobs/voice-dial.js';
import { processCallWebhook } from './jobs/call-webhook.js';
import { startFollowUpScheduler } from './jobs/followup-scheduler.js';
import { startDailyScheduler } from './jobs/daily-scheduler.js';
import { processHumanHandoff } from './jobs/human-handoff.js';
import { processCommissionCalc } from './jobs/commission-calc.js';
import { processWhatsappSend } from './jobs/whatsapp-send.js';
import { processEmailSend } from './jobs/email-send.js';
import { processPdfRender } from './jobs/pdf-render.js';
import { processCsvImport } from './jobs/csv-import.js';
import { processBroadcastSend } from './jobs/broadcast-send.js';
import { startSlaEscalationScheduler } from './jobs/sla-escalation.js';
import { startServiceVisitReminderScheduler } from './jobs/service-visit-reminder.js';
import { startAmcExpiryReminderScheduler } from './jobs/amc-expiry-reminder.js';
import { startNpsSolicitationScheduler } from './jobs/nps-solicitation.js';
import { startSequenceRunner } from './jobs/sequence-runner.js';
import { startConversationIntelScheduler } from './jobs/conversation-intel.js';
import { startLeadScoringScheduler } from './jobs/lead-scoring.js';
import { startBroadcastScheduler } from './jobs/broadcast-scheduler.js';
import { startReengagementScheduler } from './jobs/reengagement-scheduler.js';
import { processDndScrub } from './jobs/dnd-scrub.js';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

const workers: Worker<unknown>[] = [];

function mkWorker<T>(queueName: string, processor: (job: Job<T>) => Promise<void>): void {
  const w = new Worker<T>(queueName, processor, {
    connection: redis,
    concurrency: 5,
  });
  w.on('completed', (job) => log.info({ jobId: job.id, queue: queueName }, 'Job completed'));
  w.on('failed', (job, err) =>
    log.error({ jobId: job?.id, queue: queueName, err }, 'Job failed'),
  );

  workers.push(w as Worker<unknown>);
}

mkWorker('lead-ingest', processLeadIngest);
mkWorker('voice-dial', processVoiceDial);
mkWorker('call-webhook', processCallWebhook);
mkWorker('human-handoff', processHumanHandoff);
mkWorker('commission-calc', processCommissionCalc);
mkWorker('whatsapp-send', processWhatsappSend);
mkWorker('email-send', processEmailSend);
mkWorker('pdf-render', processPdfRender);
mkWorker('csv-import', processCsvImport);
mkWorker('broadcast-send', processBroadcastSend);
mkWorker('dnd-scrub', processDndScrub);

startFollowUpScheduler();
startDailyScheduler();
startSlaEscalationScheduler();
startServiceVisitReminderScheduler();
startAmcExpiryReminderScheduler();
startNpsSolicitationScheduler();
startSequenceRunner();
startConversationIntelScheduler();
startLeadScoringScheduler();
startBroadcastScheduler();
startReengagementScheduler();

log.info('Worker started — listening on: lead-ingest, voice-dial, call-webhook, human-handoff, commission-calc, whatsapp-send, email-send, pdf-render, dnd-scrub + follow-up scheduler + daily-compliance-scheduler');

async function shutdown() {
  log.info('Shutting down workers...');
  await Promise.all(workers.map((w) => w.close()));
  await redis.quit();
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
