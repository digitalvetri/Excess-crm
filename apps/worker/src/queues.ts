import { Queue } from 'bullmq';
import { redis } from './redis.js';

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

function mkQueue(name: string) {
  return new Queue(name, { connection: redis, defaultJobOptions });
}

export const queues = {
  leadIngest: mkQueue('lead-ingest'),
  voiceDial: mkQueue('voice-dial'),
  callWebhook: mkQueue('call-webhook'),
  whatsappSend: mkQueue('whatsapp-send'),
  whatsappReceive: mkQueue('whatsapp-receive'),
  emailSend: mkQueue('email-send'),
  smsOtp: mkQueue('sms-otp'),
  leadScore: mkQueue('lead-score'),
  appointmentReminder: mkQueue('appointment-reminder'),
  reportGenerate: mkQueue('report-generate'),
  commissionCalc: mkQueue('commission-calc'),
  dndScrub: mkQueue('dnd-scrub'),
  humanHandoff: mkQueue('human-handoff'),
  pdfRender: mkQueue('pdf-render'),
  csvImport: mkQueue('csv-import'),
} as const;

export type QueueName = keyof typeof queues;
