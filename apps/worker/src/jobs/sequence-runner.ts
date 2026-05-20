import pino from 'pino';
import { prisma, withSystemContext } from '@excess/db';
import { queues } from '../queues.js';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

interface DueEnrollment {
  id: string;
  tenantId: string;
  sequenceId: string;
  leadId: string;
  currentStep: number;
}

export async function runSequenceStep(): Promise<void> {
  const now = new Date();
  const due = await prisma.sequenceEnrollment.findMany({
    // sequence.isActive guard — a deactivated sequence must stop firing
    // remaining steps for already-enrolled leads, not just block new ones
    where: { status: 'ACTIVE', nextRunAt: { lte: now }, sequence: { isActive: true } },
    select: { id: true, tenantId: true, sequenceId: true, leadId: true, currentStep: true },
    take: 200,
  });
  if (due.length === 0) return;

  for (const enr of due) {
    try {
      await processEnrollment(enr);
    } catch (err) {
      log.error({ enrollmentId: enr.id, err }, 'sequence.step_error');
    }
  }
  log.info({ processed: due.length }, 'sequence_runner.complete');
}

async function processEnrollment(enr: DueEnrollment): Promise<void> {
  const { tenantId, sequenceId, leadId, currentStep, id } = enr;

  const steps = await withSystemContext(prisma, tenantId, (tx) =>
    tx.sequenceStep.findMany({ where: { sequenceId }, orderBy: { stepOrder: 'asc' } }),
  );
  const lead = await withSystemContext(prisma, tenantId, (tx) =>
    tx.lead.findUnique({
      where: { id: leadId },
      select: { name: true, phone: true, email: true, commsOptedOutAt: true },
    }),
  );

  if (!lead) {
    await withSystemContext(prisma, tenantId, (tx) =>
      tx.sequenceEnrollment.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date() } }),
    );
    return;
  }
  if (lead.commsOptedOutAt) {
    await withSystemContext(prisma, tenantId, (tx) =>
      tx.sequenceEnrollment.update({ where: { id }, data: { status: 'OPTED_OUT', completedAt: new Date() } }),
    );
    return;
  }

  const step = steps[currentStep];
  if (!step) {
    await withSystemContext(prisma, tenantId, (tx) =>
      tx.sequenceEnrollment.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } }),
    );
    return;
  }

  // Advance the enrollment FIRST so a crash never re-sends the same step
  const nextStep = steps[currentStep + 1];
  await withSystemContext(prisma, tenantId, (tx) =>
    tx.sequenceEnrollment.update({
      where: { id },
      data: nextStep
        ? { currentStep: currentStep + 1, nextRunAt: new Date(Date.now() + nextStep.delayHours * 3600 * 1000) }
        : { currentStep: currentStep + 1, status: 'COMPLETED', completedAt: new Date() },
    }),
  );

  // Dispatch the message for this step
  const params = (step.params ?? {}) as Record<string, string>;
  if (step.channel === 'WHATSAPP') {
    await queues.whatsappSend.add('whatsapp-send', {
      tenantId,
      leadId,
      phone: lead.phone,
      template: step.templateName,
      vars: params,
    });
  } else if (step.channel === 'EMAIL') {
    if (lead.email) {
      await queues.emailSend.add('email-send', {
        tenantId,
        to: lead.email,
        subject: params['subject'] ?? 'A message from Excess Renew',
        template: 'SEQUENCE_MESSAGE',
        vars: { body: params['body'] ?? '', customerName: lead.name },
      });
    } else {
      log.warn({ tenantId, leadId, sequenceId }, 'sequence.email_skipped_no_address');
    }
  } else {
    log.warn({ tenantId, leadId, channel: step.channel }, 'sequence.channel_unsupported');
  }

  log.info({ tenantId, sequenceId, leadId, step: currentStep }, 'sequence.step_sent');
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

export function startSequenceRunner(): void {
  const run = () => {
    void runSequenceStep().catch((err: unknown) => log.error({ err }, 'sequence_runner.run_error'));
  };

  setTimeout(run, 3 * 60 * 1000); // 3-min startup offset
  setInterval(run, CHECK_INTERVAL_MS);

  log.info({ intervalMs: CHECK_INTERVAL_MS }, 'sequence_runner.started');
}
