export { RESHMA_VERIFY_PROMPT, RESHMA_VERIFY_TOOLS } from './prompts/reshma-verify.js';
export { KARTHIK_SALES_PROMPT, KARTHIK_SALES_TOOLS } from './prompts/karthik-sales.js';
export { RESHMA_FOLLOWUP_PROMPT, RESHMA_FOLLOWUP_TOOLS } from './prompts/reshma-followup.js';

export const PERSONA_IDS = ['RESHMA_VERIFY', 'KARTHIK_SALES', 'RESHMA_FOLLOWUP'] as const;
export type PersonaId = typeof PERSONA_IDS[number];
