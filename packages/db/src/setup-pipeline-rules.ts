/**
 * Applies a sensible, validated starter set of pipeline rules to the HQ tenant.
 * Idempotent — safe to re-run. Run against any environment by pointing DATABASE_URL
 * at it:
 *
 *   pnpm --filter @excess/db run setup:rules                    # SLA + assignment
 *   pnpm --filter @excess/db run setup:rules --with-convert-gate # + the convert gate
 *
 * The CONVERTED stage gate is opt-in: it BLOCKS marking a lead converted unless a
 * quotation was sent through the CRM. Only enable it if "quote before convert" is
 * truly your process.
 */
import { prisma } from './client.js';
import { withSystemContext } from './with-tenant.js';

const SLA_RULES = [
  { stage: 'NEW', thresholdHours: 2 },
  { stage: 'QUALIFIED', thresholdHours: 24 },
  { stage: 'FOLLOW_UP', thresholdHours: 48 },
] as const;

const WITH_CONVERT_GATE = process.argv.includes('--with-convert-gate');

async function main() {
  const hq = await prisma.tenant.findFirst({ where: { type: 'HQ' }, select: { id: true, name: true } });
  if (!hq) {
    console.error('✗ No HQ tenant found — nothing to do.');
    process.exit(1);
  }
  console.log(`Setting up pipeline rules for: ${hq.name} (${hq.id})\n`);

  await withSystemContext(prisma, hq.id, async (tx) => {
    // 1. SLA rules — flag leads left too long in a stage (Notify only; no risk).
    for (const r of SLA_RULES) {
      const existing = await tx.slaRule.findFirst({ where: { tenantId: hq.id, stage: r.stage, action: 'NOTIFY' } });
      if (existing) {
        console.log(`  • SLA ${r.stage} — already configured, skipped`);
        continue;
      }
      await tx.slaRule.create({
        data: { tenantId: hq.id, stage: r.stage, thresholdHours: r.thresholdHours, action: 'NOTIFY' },
      });
      console.log(`  ✓ SLA ${r.stage}: notify after ${r.thresholdHours}h`);
    }

    // 2. Assignment — a catch-all rule round-robins source leads to a team.
    let team = await tx.team.findFirst({ where: { tenantId: hq.id }, select: { id: true, name: true } });
    if (!team) {
      team = await tx.team.create({ data: { tenantId: hq.id, name: 'Sales Team' }, select: { id: true, name: true } });
      console.log(`  ✓ Created team "${team.name}"`);
    }
    const rule = await tx.routingRule.findFirst({ where: { tenantId: hq.id } });
    if (rule) {
      console.log('  • Assignment rule — already configured, skipped');
    } else {
      await tx.routingRule.create({ data: { tenantId: hq.id, priority: 100, condition: {}, targetTeamId: team.id } });
      console.log(`  ✓ Assignment: catch-all → ${team.name} (round-robin)`);
    }

    // 3. Stage gate (opt-in) — block CONVERTED without a sent quotation.
    if (WITH_CONVERT_GATE) {
      const gate = await tx.stageGate.findFirst({ where: { tenantId: hq.id, stage: 'CONVERTED' } });
      if (gate) {
        console.log('  • Stage gate CONVERTED — already configured, skipped');
      } else {
        await tx.stageGate.create({
          data: { tenantId: hq.id, stage: 'CONVERTED', requiredFields: [], requiredActivityTypes: ['QUOTATION_SENT'] },
        });
        console.log('  ✓ Stage gate: CONVERTED requires a QUOTATION_SENT activity');
      }
    } else {
      console.log('  – Skipped CONVERTED stage gate (pass --with-convert-gate to enable it)');
    }
  });

  console.log('\nDone. Adjust or disable any rule anytime in Settings.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
