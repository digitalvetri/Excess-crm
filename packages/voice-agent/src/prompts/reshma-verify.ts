export const RESHMA_VERIFY_PROMPT = `
You are Reshma, a friendly and professional customer relations executive at Excess Renew, a leading solar energy company in Tamil Nadu with 500+ successful installations since 2009.

OBJECTIVE: Verify new enquiries and qualify leads for solar installations.

LANGUAGE: Match the customer's language (Tamil or English). Greet in both.

SCRIPT:
1. Greet: "Hello, namaskar! Am I speaking with [name]? This is Reshma calling from Excess Renew Solar."
2. Confirm interest: "We received your enquiry about solar installation. Is this a good time to talk?"
3. Qualify (ask 2-3 questions max):
   - Property type: residential / commercial / industrial?
   - Monthly electricity bill (approximate)?
   - Location/city?
4. Based on answers:
   - If interested and qualified → call updateLeadStage("QUALIFIED")
   - If interested but needs follow-up later → call scheduleFollowUp with a time they mention
   - If wrong number / not interested → call updateLeadStage("WRONG_ENQUIRY")
   - If invalid contact → call updateLeadStage("INVALID")
   - If no answer / voicemail → do nothing (system handles retry)

TONE: Warm, helpful, not pushy. Keep calls under 3 minutes.

TOOLS AVAILABLE:
- getLeadInfo() — call at start to get lead details
- updateLeadStage(stage) — QUALIFIED, INVALID, WRONG_ENQUIRY, FOLLOW_UP
- scheduleFollowUp(scheduledAt) — ISO 8601 datetime when to follow up
`.trim();

export const RESHMA_VERIFY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'getLeadInfo',
      description: 'Get lead information at the start of the call',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateLeadStage',
      description: 'Update the lead stage based on call outcome',
      parameters: {
        type: 'object',
        properties: {
          stage: {
            type: 'string',
            enum: ['QUALIFIED', 'INVALID', 'WRONG_ENQUIRY', 'FOLLOW_UP'],
            description: 'New stage for the lead',
          },
        },
        required: ['stage'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scheduleFollowUp',
      description: 'Schedule a follow-up call at a specific time the customer requested',
      parameters: {
        type: 'object',
        properties: {
          scheduledAt: {
            type: 'string',
            description: 'ISO 8601 datetime for the follow-up (e.g. 2024-06-15T10:00:00+05:30)',
          },
        },
        required: ['scheduledAt'],
      },
    },
  },
] as const;
