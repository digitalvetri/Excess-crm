import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

async function seedHash(password: string): Promise<string> {
  return argon2.hash(password);
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // 1. HQ Tenant
  const hq = await prisma.tenant.upsert({
    where: { id: 'aaaaaaaa-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      name: 'Excess Renew Tech Pvt Ltd',
      type: 'HQ',
      status: 'ACTIVE',
      contactName: 'Admin',
      contactEmail: 'admin@excessindia.com',
      contactPhone: '+919999999999',
    },
  });

  // 2. Admin user for HQ
  await prisma.user.upsert({
    where: { email: 'admin@excessindia.com' },
    update: {},
    create: {
      tenantId: hq.id,
      email: 'admin@excessindia.com',
      name: 'Excess Admin',
      role: 'ADMIN',
      passwordHash: await seedHash('ExcessAdmin2024!'),
      isActive: true,
    },
  });

  // 3. VoiceAgentSettings for HQ
  await prisma.voiceAgentSettings.upsert({
    where: { tenantId: hq.id },
    update: {},
    create: {
      tenantId: hq.id,
      businessHoursStart: '09:00',
      businessHoursEnd: '21:00',
      timezone: 'Asia/Kolkata',
      dailyCallCap: 2000,
    },
  });

  // 4. Demo franchise tenant
  const franchise = await prisma.tenant.upsert({
    where: { id: 'bbbbbbbb-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: 'bbbbbbbb-0000-0000-0000-000000000002',
      name: 'Demo Franchise Coimbatore',
      type: 'FRANCHISE',
      status: 'ACTIVE',
      tier: 'SILVER',
      territory: { cities: ['Coimbatore', 'Tiruppur'] },
      commissionSlabs: [{ minValue: 0, maxValue: 999999999, ratePercent: 5 }],
    },
  });

  // Employee user (HQ staff)
  await prisma.user.upsert({
    where: { email: 'employee@excessindia.com' },
    update: {},
    create: {
      tenantId: hq.id,
      email: 'employee@excessindia.com',
      name: 'Demo Employee',
      role: 'EMPLOYEE',
      passwordHash: await seedHash('ExcessEmp2024!'),
      isActive: true,
    },
  });

  // Franchise owner user
  await prisma.user.upsert({
    where: { email: 'franchise@demo.excess.in' },
    update: {},
    create: {
      tenantId: franchise.id,
      email: 'franchise@demo.excess.in',
      name: 'Demo Franchise Owner',
      role: 'FRANCHISE_OWNER',
      passwordHash: await seedHash('FranchiseDemo2024!'),
      isActive: true,
    },
  });

  // Franchise staff user
  await prisma.user.upsert({
    where: { email: 'staff@demo.excess.in' },
    update: {},
    create: {
      tenantId: franchise.id,
      email: 'staff@demo.excess.in',
      name: 'Demo Franchise Staff',
      role: 'FRANCHISE_USER',
      passwordHash: await seedHash('FranchiseStaff2024!'),
      isActive: true,
    },
  });

  // 5. DND list sample entry
  await prisma.dndList.upsert({
    where: { phone: '+910000000000' },
    update: {},
    create: {
      phone: '+910000000000',
      reason: 'Sample DND entry — do not call',
    },
  });

  process.stdout.write('Seed complete\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`Seed failed: ${String(err)}\n`);
  process.exit(1);
}).finally(() => {
  void prisma.$disconnect();
});
