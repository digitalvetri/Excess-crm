/**
 * Applies the active voice-agent prompts (from @excess/voice-agent) into voice_agent_configs
 * for every tenant. Idempotent — a persona whose active prompt already matches is left
 * untouched; otherwise the old active config is deactivated and a new active version created.
 *
 * Shared by the CLI seed (seed-voice-prompts.ts) and the admin reseed endpoint, so both stay
 * in sync. Speaker voices are Sarvam bulbul:v2 names.
 */
import {
  EXCESS_AGENT_PROMPT,
  RESHMA_VERIFY_PROMPT,
  KARTHIK_SALES_PROMPT,
  RESHMA_FOLLOWUP_PROMPT,
} from '@excess/voice-agent';
import { prisma } from './client.js';
import { withSystemContext } from './with-tenant.js';

const PERSONAS = [
  { id: 'EXCESS_AGENT', prompt: EXCESS_AGENT_PROMPT, voiceId: 'anushka' },
  { id: 'RESHMA_VERIFY', prompt: RESHMA_VERIFY_PROMPT, voiceId: 'anushka' },
  { id: 'KARTHIK_SALES', prompt: KARTHIK_SALES_PROMPT, voiceId: 'abhilash' },
  { id: 'RESHMA_FOLLOWUP', prompt: RESHMA_FOLLOWUP_PROMPT, voiceId: 'anushka' },
] as const;

export interface VoicePromptSeedResult {
  tenants: { id: string; name: string; updated: number; skipped: number }[];
  totalUpdated: number;
}

export async function applyVoicePromptSeed(): Promise<VoicePromptSeedResult> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  const results: VoicePromptSeedResult['tenants'] = [];

  for (const tenant of tenants) {
    let updated = 0;
    let skipped = 0;
    await withSystemContext(prisma, tenant.id, async (tx) => {
      for (const p of PERSONAS) {
        const active = await tx.voiceAgentConfig.findFirst({
          where: { tenantId: tenant.id, personaId: p.id, isActive: true },
          orderBy: { version: 'desc' },
        });
        if (active && active.systemPrompt === p.prompt) {
          skipped += 1;
          continue;
        }
        const latest = await tx.voiceAgentConfig.findFirst({
          where: { tenantId: tenant.id, personaId: p.id },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        await tx.voiceAgentConfig.updateMany({
          where: { tenantId: tenant.id, personaId: p.id, isActive: true },
          data: { isActive: false },
        });
        await tx.voiceAgentConfig.create({
          data: {
            tenantId: tenant.id,
            personaId: p.id,
            systemPrompt: p.prompt,
            voiceConfig: { voiceId: p.voiceId },
            isActive: true,
            version: (latest?.version ?? 0) + 1,
            activatedAt: new Date(),
          },
        });
        updated += 1;
      }
    });
    results.push({ id: tenant.id, name: tenant.name, updated, skipped });
  }

  return { tenants: results, totalUpdated: results.reduce((s, t) => s + t.updated, 0) };
}
