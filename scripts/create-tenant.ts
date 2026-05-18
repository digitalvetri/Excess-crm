#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] } } });

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const name = get('--name');
  const email = get('--email');
  const phone = get('--phone') ?? '';
  const password = get('--password') ?? 'ChangeMe123!';

  if (!name || !email) {
    console.error('Usage: tsx scripts/create-tenant.ts --name "Name" --email "email@example.com" [--phone "+91..."] [--password "..."]');
    process.exit(1);
  }

  const tenant = await prisma.tenant.create({
    data: {
      name,
      type: 'FRANCHISE',
      status: 'ONBOARDING',
      tier: 'BRONZE',
      contactEmail: email,
      contactPhone: phone,
      territory: {},
      commissionSlabs: [{ minValue: 0, maxValue: 999999999, ratePercent: 5 }],
    },
  });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      name,
      role: 'FRANCHISE_OWNER',
      passwordHash: createHash('sha256').update(password).digest('hex'),
      isActive: true,
    },
  });

  await prisma.voiceAgentSettings.create({
    data: {
      tenantId: tenant.id,
      businessHoursStart: '09:00',
      businessHoursEnd: '21:00',
      timezone: 'Asia/Kolkata',
      dailyCallCap: 500,
    },
  });

  console.log(`✅ Tenant created: ${tenant.id}`);
  console.log(`✅ User created: ${user.id} (${email})`);
  console.log(`⚠️  Password hash is SHA256 placeholder — reset via API before use`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
