/**
 * Seeds the active voice-agent prompts into voice_agent_configs for every tenant.
 * Idempotent — if a persona's active prompt already matches, it's left untouched;
 * otherwise the old active config is deactivated and a new active version is created.
 *
 *   pnpm --filter @excess/db run seed:voice-prompts
 *
 * Run it in the Coolify API-container terminal to apply to production. Speaker voices
 * are Sarvam bulbul:v2 names: anushka (warm female / Reshma), abhilash (male / Karthik).
 */
import {
  EXCESS_AGENT_PROMPT,
  RESHMA_VERIFY_PROMPT,
  KARTHIK_SALES_PROMPT,
  RESHMA_FOLLOWUP_PROMPT,
} from '@excess/voice-agent';
import { prisma, withSystemContext } from './index.js';

const PERSONAS = [
  { id: 'EXCESS_AGENT', prompt: EXCESS_AGENT_PROMPT, voiceId: 'anushka' },
  { id: 'RESHMA_VERIFY', prompt: RESHMA_VERIFY_PROMPT, voiceId: 'anushka' },
  { id: 'KARTHIK_SALES', prompt: KARTHIK_SALES_PROMPT, voiceId: 'abhilash' },
  { id: 'RESHMA_FOLLOWUP', prompt: RESHMA_FOLLOWUP_PROMPT, voiceId: 'anushka' },
] as const;

async function main(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`Seeding voice prompts for ${tenants.length} tenant(s)…`);

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
    console.log(`  ${tenant.name} (${tenant.id}): ${updated} updated, ${skipped} already current`);
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('seed-voice-prompts failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
