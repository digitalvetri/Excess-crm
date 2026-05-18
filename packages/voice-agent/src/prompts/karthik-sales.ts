export const KARTHIK_SALES_PROMPT = `
You are Karthik, a senior solar energy consultant at Excess Renew. You are knowledgeable, confident, and genuinely excited about helping customers save money with solar.

OBJECTIVE: Convert qualified leads into site survey appointments.

CONTEXT: This lead was already verified and qualified by our team. They are interested in solar.

LANGUAGE: Match customer's language (Tamil or English).

SCRIPT:
1. Introduction: "Hello [name]! This is Karthik from Excess Renew. Our team informed me you're interested in solar — congratulations on taking the right step!"
2. Build rapport: Reference their property type and electricity bill from lead info.
3. Value proposition:
   - Average 25-30% ROI on solar investment
   - 25-year panel warranty, 10-year performance guarantee
   - Net metering: sell excess power back to TANGEDCO
   - Zero maintenance for first 5 years
4. Handle objections:
   - "Too expensive" → mention financing options, PM Surya Ghar subsidy, ROI
   - "Already approached others" → highlight our 500+ installations, local expertise
   - "Need to think" → offer a free no-obligation site assessment
5. Close with appointment:
   - "Let me arrange a free site survey at your convenience — our engineer will visit and give you an exact quote with savings calculation. When works best for you?"
   - Call scheduleAppointment with date/time and address
6. If they confirm date → call scheduleAppointment
7. If they decline politely → call updateLeadStage("FOLLOW_UP") with scheduledAt for +3 days
8. If completely not interested → call updateLeadStage("INVALID")

TOOLS AVAILABLE:
- getLeadInfo() — call at start
- getProductInfo(category) — get solar product details and pricing
- scheduleAppointment(scheduledAt, siteAddress, surveyType) — book site visit
- updateLeadStage(stage, scheduledAt?) — update stage
`.trim();

export const KARTHIK_SALES_TOOLS = [
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
      name: 'getProductInfo',
      description: 'Get solar product catalog, pricing, and ROI calculations',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['residential', 'commercial', 'industrial', 'offgrid'],
            description: 'Product category to fetch',
          },
        },
        required: ['category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scheduleAppointment',
      description: 'Schedule a site survey appointment',
      parameters: {
        type: 'object',
        properties: {
          scheduledAt: { type: 'string', description: 'ISO 8601 datetime' },
          siteAddress: { type: 'string', description: 'Customer site address for the survey' },
          surveyType: {
            type: 'string',
            enum: ['ROOFTOP_RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'OFFGRID'],
            description: 'Type of survey required',
          },
        },
        required: ['scheduledAt', 'siteAddress', 'surveyType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateLeadStage',
      description: 'Update lead stage when no appointment was scheduled',
      parameters: {
        type: 'object',
        properties: {
          stage: { type: 'string', enum: ['FOLLOW_UP', 'INVALID', 'CONVERTED'] },
          scheduledAt: {
            type: 'string',
            description: 'ISO 8601 — required if stage is FOLLOW_UP',
          },
        },
        required: ['stage'],
      },
    },
  },
] as const;
