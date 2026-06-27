/**
 * Seeds the active voice-agent prompts into voice_agent_configs for every tenant.
 * Idempotent — see applyVoicePromptSeed. The same logic is exposed to admins via
 * POST /voice-agent/reseed-prompts.
 *
 *   pnpm --filter @excess/db run seed:voice-prompts
 *
 * Run it in the Coolify API-container terminal to apply to production.
 */
import { prisma } from './index.js';
import { applyVoicePromptSeed } from './voice-prompt-seed.js';

async function main(): Promise<void> {
  const result = await applyVoicePromptSeed();
  console.log(`Seeding voice prompts for ${result.tenants.length} tenant(s)…`);
  for (const t of result.tenants) {
    console.log(`  ${t.name} (${t.id}): ${t.updated} updated, ${t.skipped} already current`);
  }
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('seed-voice-prompts failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
