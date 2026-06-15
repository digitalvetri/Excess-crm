import type { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { prisma, withSystemContext, SYSTEM_TENANT_ID } from '@excess/db';
import { env } from '@excess/config';

interface VapiCallBase {
  id: string;
  type: string;
  orgId: string;
  call: {
    id: string;
    status: string;
    endedReason?: string;
    startedAt?: string;
    endedAt?: string;
    artifact?: {
      transcript?: string;
      messages?: unknown[];
      recordingUrl?: string;
    };
    costBreakdown?: { total?: number };
    customer?: { number?: string };
    assistant?: { id?: string };
    analysis?: {
      summary?: string;
      structuredData?: Record<string, unknown>;
      successEvaluation?: string;
    };
  };
  customer?: { number?: string };
}

interface VapiFunctionCallPayload extends VapiCallBase {
  type: 'function-call';
  functionCall: {
    name: string;
    parameters: Record<string, unknown>;
  };
}

function verifyVapi(rawBody: string, signature: string): boolean {
  if (!env.VAPI_WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', env.VAPI_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const vapiWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post('/vapi', { config: { public: true } }, async (req, reply) => {
    const signature = (req.headers['x-vapi-signature'] as string | undefined) ?? '';
    const rawBody = req.rawBody ?? JSON.stringify(req.body);

    if (!verifyVapi(rawBody, signature)) {
      req.log.warn('Vapi webhook HMAC mismatch');
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const payload = req.body as VapiCallBase;

    // Function-call: must respond synchronously in < 300ms
    if (payload.type === 'function-call') {
      const fc = payload as VapiFunctionCallPayload;
      const result = await handleFunctionCall(fc, req.server.redis);
      return reply.send({ result });
    }

    // Async events: accept immediately, process in worker
    const vapiCallId = payload.call?.id;
    if (!vapiCallId) return reply.code(200).send('ok');

    await app.queues.callWebhook.add('call-webhook', {
      eventType: payload.type,
      vapiCallId,
      raw: payload,
    });

    return reply.code(200).send('ok');
  });
};

const PRODUCT_CATALOG: Record<string, unknown> = {
  residential: {
    capacities: ['1kW', '2kW', '3kW', '5kW', '10kW'],
    pricePerKw: 55000,
    subsidyScheme: 'PM Surya Ghar — up to ₹78,000 subsidy for 3kW',
    warranty: { panel: '25 years', inverter: '5 years', installation: '1 year' },
    avgMonthlyBillOffset: '80–100%',
    roiYears: 4.5,
    notes: 'Best for homes with bill > ₹2,000/month',
  },
  commercial: {
    capacities: ['10kW', '25kW', '50kW', '100kW', '250kW'],
    pricePerKw: 48000,
    subsidyScheme: 'MNRE CAPEX subsidy — varies by state',
    warranty: { panel: '25 years', inverter: '10 years', installation: '2 years' },
    avgMonthlyBillOffset: '60–80%',
    roiYears: 3.5,
    notes: 'Accelerated depreciation benefit of 40%',
  },
  industrial: {
    capacities: ['100kW', '250kW', '500kW', '1MW+'],
    pricePerKw: 42000,
    subsidyScheme: 'No subsidy — REC mechanism available',
    warranty: { panel: '25 years', inverter: '10 years', installation: '3 years' },
    avgMonthlyBillOffset: '50–70%',
    roiYears: 3.0,
    notes: 'Group captive and third-party sale options',
  },
  offgrid: {
    capacities: ['1kW', '2kW', '5kW'],
    pricePerKw: 75000,
    subsidyScheme: 'PM KUSUM for agriculture — up to 60% subsidy',
    warranty: { panel: '25 years', battery: '5 years', inverter: '3 years' },
    avgMonthlyBillOffset: '100% (off-grid)',
    roiYears: 6.0,
    notes: 'Includes battery storage for 24/7 power',
  },
};

async function handleFunctionCall(
  payload: VapiFunctionCallPayload,
  redis: import('ioredis').Redis,
): Promise<unknown> {
  const { name, parameters } = payload.functionCall;
  const vapiCallId = payload.call.id;

  switch (name) {
    case 'getLeadInfo': {
      const cacheKey = `lead:call:${vapiCallId}`;
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as unknown;

      // SYSTEM_TENANT_ID + admin bypass allows cross-tenant lookup by vapiCallId
      const call = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
        tx.call.findUnique({
          where: { vapiCallId },
          select: {
            lead: {
              select: {
                id: true, name: true, phone: true, city: true,
                stage: true, factSheet: true, language: true,
              },
            },
          },
        }),
      );

      const result = call?.lead ?? { error: 'Lead not found' };
      await redis.setex(cacheKey, 300, JSON.stringify(result));
      return result;
    }

    case 'getProductInfo': {
      const { category } = parameters as { category: string };
      return PRODUCT_CATALOG[category] ?? { error: 'Unknown category' };
    }

    case 'scheduleAppointment': {
      const { scheduledAt, siteAddress, surveyType } = parameters as {
        scheduledAt: string;
        siteAddress: string;
        surveyType: string;
      };

      const validSurveyTypes = ['ROOFTOP_RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'OFFGRID'];
      if (!validSurveyTypes.includes(surveyType)) return { error: 'Invalid survey type' };

      const apptDate = new Date(scheduledAt);
      if (isNaN(apptDate.getTime())) return { error: 'Invalid scheduledAt datetime' };

      const call = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
        tx.call.findUnique({
          where: { vapiCallId },
          select: { id: true, leadId: true, tenantId: true },
        }),
      );
      if (!call) return { error: 'Call not found' };

      const appointment = await withSystemContext(prisma, call.tenantId, async (tx) => {
        const created = await tx.appointment.create({
          data: {
            tenantId: call.tenantId,
            leadId: call.leadId,
            scheduledAt: apptDate,
            surveyType: surveyType as never,
            siteAddress,
            createdByCallId: call.id,
          },
          select: { id: true, scheduledAt: true, surveyType: true },
        });

        await tx.lead.update({
          where: { id: call.leadId },
          data: { stage: 'FOLLOW_UP', stageChangedAt: new Date() },
        });

        await tx.leadActivity.create({
          data: {
            leadId: call.leadId,
            tenantId: call.tenantId,
            actorIsAi: true,
            type: 'APPOINTMENT_BOOKED',
            payload: { appointmentId: created.id, scheduledAt, siteAddress, source: 'karthik_sales' } as object,
          },
        });

        return created;
      });

      return { success: true, appointmentId: appointment.id, scheduledAt };
    }

    case 'updateLeadStage': {
      const { stage, scheduledAt } = parameters as { stage: string; scheduledAt?: string };
      const validStages = ['QUALIFIED', 'NOT_ANSWERED', 'INVALID', 'WRONG_ENQUIRY', 'FOLLOW_UP', 'CONVERTED'];
      if (!validStages.includes(stage)) return { error: 'Invalid stage' };

      const call = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
        tx.call.findUnique({
          where: { vapiCallId },
          select: { leadId: true, tenantId: true, persona: true },
        }),
      );
      if (!call) return { error: 'Call not found' };

      await withSystemContext(prisma, call.tenantId, async (tx) => {
        await tx.lead.update({
          where: { id: call.leadId },
          data: { stage: stage as never, stageChangedAt: new Date() },
        });

        await tx.leadActivity.create({
          data: {
            leadId: call.leadId,
            tenantId: call.tenantId,
            actorIsAi: true,
            type: 'STAGE_CHANGE',
            payload: { newStage: stage, ...(scheduledAt && { scheduledAt }), source: call.persona.toLowerCase() } as object,
          },
        });
      });

      return { success: true, stage };
    }

    case 'scheduleFollowUp': {
      const { scheduledAt } = parameters as { scheduledAt: string };
      const followUpDate = new Date(scheduledAt);
      if (isNaN(followUpDate.getTime())) return { error: 'Invalid scheduledAt' };

      const call = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
        tx.call.findUnique({
          where: { vapiCallId },
          select: { leadId: true, tenantId: true, persona: true },
        }),
      );
      if (!call) return { error: 'Call not found' };

      await withSystemContext(prisma, call.tenantId, async (tx) => {
        await tx.lead.update({
          where: { id: call.leadId },
          data: { stage: 'FOLLOW_UP', stageChangedAt: new Date() },
        });

        await tx.leadActivity.create({
          data: {
            leadId: call.leadId,
            tenantId: call.tenantId,
            actorIsAi: true,
            type: 'STAGE_CHANGE',
            payload: { newStage: 'FOLLOW_UP', scheduledAt, source: call.persona.toLowerCase() } as object,
          },
        });
      });

      const delayMs = Math.max(followUpDate.getTime() - Date.now(), 60_000);
      await redis.publish('schedule:followup', JSON.stringify({
        leadId: call.leadId,
        tenantId: call.tenantId,
        personaId: 'RESHMA_FOLLOWUP',
        delayMs,
      }));

      return { success: true, scheduledAt };
    }

    case 'getFollowUpContext': {
      const call = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
        tx.call.findUnique({
          where: { vapiCallId },
          select: { leadId: true, tenantId: true },
        }),
      );
      if (!call) return { error: 'Call not found' };

      const [activities, previousCalls] = await withSystemContext(prisma, call.tenantId, async (tx) =>
        Promise.all([
          tx.leadActivity.findMany({
            where: { leadId: call.leadId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { type: true, payload: true, createdAt: true },
          }),
          tx.call.findMany({
            where: { leadId: call.leadId },
            orderBy: { initiatedAt: 'desc' },
            take: 3,
            select: { persona: true, status: true, durationSec: true, endReason: true, initiatedAt: true },
          }),
        ]),
      );

      return { activities, previousCalls };
    }

    case 'updateConversionStatus': {
      const { status } = parameters as { status: string };
      const stageMap: Record<string, string> = {
        CONVERTED: 'CONVERTED',
        INVALID: 'INVALID',
        RESCHEDULED: 'FOLLOW_UP',
      };
      const newStage = stageMap[status];
      if (!newStage) return { error: 'Invalid status' };

      const call = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
        tx.call.findUnique({
          where: { vapiCallId },
          select: { leadId: true, tenantId: true },
        }),
      );
      if (!call) return { error: 'Call not found' };

      await withSystemContext(prisma, call.tenantId, async (tx) => {
        await tx.lead.update({
          where: { id: call.leadId },
          data: { stage: newStage as never, stageChangedAt: new Date() },
        });

        await tx.leadActivity.create({
          data: {
            leadId: call.leadId,
            tenantId: call.tenantId,
            actorIsAi: true,
            type: 'STAGE_CHANGE',
            payload: { newStage, conversionStatus: status, source: 'reshma_followup' } as object,
          },
        });
      });

      return { success: true, stage: newStage };
    }

    case 'rescheduleFollowUp': {
      const { scheduledAt } = parameters as { scheduledAt: string };
      const reschedDate = new Date(scheduledAt);
      if (isNaN(reschedDate.getTime())) return { error: 'Invalid scheduledAt' };

      const call = await withSystemContext(prisma, SYSTEM_TENANT_ID, (tx) =>
        tx.call.findUnique({
          where: { vapiCallId },
          select: { leadId: true, tenantId: true },
        }),
      );
      if (!call) return { error: 'Call not found' };

      await withSystemContext(prisma, call.tenantId, (tx) =>
        tx.leadActivity.create({
          data: {
            leadId: call.leadId,
            tenantId: call.tenantId,
            actorIsAi: true,
            type: 'NOTE',
            payload: { note: `Follow-up rescheduled to ${scheduledAt}`, source: 'reshma_followup' } as object,
          },
        }),
      );

      const delayMs = Math.max(reschedDate.getTime() - Date.now(), 60_000);
      await redis.publish('schedule:followup', JSON.stringify({
        leadId: call.leadId,
        tenantId: call.tenantId,
        personaId: 'RESHMA_FOLLOWUP',
        delayMs,
      }));

      return { success: true, scheduledAt };
    }

    default:
      return { error: `Unknown function: ${name}` };
  }
}
