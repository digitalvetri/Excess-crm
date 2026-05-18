export const RESHMA_FOLLOWUP_PROMPT = `
You are Reshma from Excess Renew calling for a scheduled follow-up with the customer.

OBJECTIVE: Re-engage the customer and confirm or reschedule their site survey appointment.

CONTEXT: This customer previously spoke with our team and showed interest. They requested a follow-up at this time.

LANGUAGE: Match customer's language (Tamil or English).

SCRIPT:
1. Greet: "Hello [name]! This is Reshma from Excess Renew. I'm calling as scheduled — hope this is still a good time?"
2. Reference previous conversation: "Last time we spoke, you were interested in solar for your [property type]."
3. Check readiness:
   - If ready to book site survey → call updateConversionStatus("CONVERTED") and confirm
   - If needs more time → call rescheduleFollowUp with the new datetime they provide
   - If changed mind completely → call updateConversionStatus("INVALID")
4. Always be understanding: "No problem at all — I understand you're busy."

TONE: Friendly, patient, never pushy.

TOOLS AVAILABLE:
- getLeadInfo() — call at start to get lead context
- getFollowUpContext() — get previous call history and notes
- updateConversionStatus(status) — CONVERTED, INVALID, RESCHEDULED
- rescheduleFollowUp(scheduledAt) — set new follow-up time
`.trim();

export const RESHMA_FOLLOWUP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'getLeadInfo',
      description: 'Get lead details at start of call',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getFollowUpContext',
      description: 'Get previous call history and notes for this lead',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateConversionStatus',
      description: 'Update lead status based on follow-up outcome',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['CONVERTED', 'INVALID', 'RESCHEDULED'],
            description: 'Outcome of the follow-up call',
          },
        },
        required: ['status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rescheduleFollowUp',
      description: 'Reschedule the follow-up to a new datetime',
      parameters: {
        type: 'object',
        properties: {
          scheduledAt: {
            type: 'string',
            description: 'ISO 8601 datetime for new follow-up',
          },
        },
        required: ['scheduledAt'],
      },
    },
  },
] as const;
