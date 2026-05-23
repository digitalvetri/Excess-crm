/**
 * seed-dashboard.ts
 * Fills dummy data so every dashboard widget shows populated content.
 * Run AFTER seed.ts + seed-leads.ts + seed-appointments.ts.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const HQ    = 'aaaaaaaa-0000-0000-0000-000000000001';
const FRAN1 = 'bbbbbbbb-0000-0000-0000-000000000002'; // already exists — Demo Franchise Coimbatore

function daysAgo(n: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3600_000);
}
function hoursFromNow(n: number): Date {
  return new Date(Date.now() + n * 3600_000);
}
function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function phone(): string {
  const pre = ['98765', '91234', '94567', '97890', '90123', '88765', '87654', '80123'];
  return rand(pre) + String(Math.floor(10000 + Math.random() * 90000));
}

// ─── Name pool ────────────────────────────────────────────────────────────────
const FIRST = ['Rajesh','Priya','Suresh','Kavitha','Murugan','Lakshmi','Arjun',
               'Deepa','Selvam','Anitha','Karthik','Meena','Senthil','Padma',
               'Vijay','Rekha','Dinesh','Geetha','Manoj','Usha','Prakash'];
const LAST  = ['Kumar','Raj','Krishnan','Murugesan','Rajan','Selvam','Natarajan',
               'Subramanian','Pillai','Nadar','Gounder','Reddy','Sharma','Nair','Iyer'];
const CITIES = ['Coimbatore','Chennai','Madurai','Salem','Trichy','Tiruppur','Erode'];
const SOURCES: Array<'META'|'JUSTDIAL'|'INDIAMART'|'WEBSITE'|'WHATSAPP'|'MANUAL'> =
  ['META','META','META','JUSTDIAL','JUSTDIAL','INDIAMART','INDIAMART','WEBSITE','WHATSAPP','MANUAL'];

function makeName() { return `${rand(FIRST)} ${rand(LAST)}`; }

async function main() {
  // ─── 0. Load existing data ───────────────────────────────────────────────
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@excessindia.com' } });
  const convertedLeads = await prisma.lead.findMany({
    where: { tenantId: HQ, stage: 'CONVERTED' },
    select: { id: true },
    take: 8,
  });

  // ─── 1. Leads for today (7 NEW leads) ────────────────────────────────────
  console.log('Seeding today\'s leads…');
  const todayLeads: string[] = [];
  for (let i = 0; i < 7; i++) {
    const name = makeName();
    const l = await prisma.lead.create({
      data: {
        tenantId: HQ,
        name,
        phone: phone(),
        city: rand(CITIES),
        stage: 'NEW',
        sourceType: rand(SOURCES),
        aiScore: 50 + Math.floor(Math.random() * 45),
        createdAt: hoursAgo(i * 1.5),
        stageChangedAt: hoursAgo(i * 1.5),
        language: rand(['ta', 'ta', 'en']),
      },
    });
    todayLeads.push(l.id);
  }

  // ─── 2. Leads for yesterday (5 leads) ────────────────────────────────────
  console.log('Seeding yesterday\'s leads…');
  for (let i = 0; i < 5; i++) {
    await prisma.lead.create({
      data: {
        tenantId: HQ,
        name: makeName(),
        phone: phone(),
        city: rand(CITIES),
        stage: rand(['NEW', 'QUALIFIED', 'NOT_ANSWERED'] as const),
        sourceType: rand(SOURCES),
        aiScore: 45 + Math.floor(Math.random() * 50),
        createdAt: daysAgo(1, 8 + i * 2),
        stageChangedAt: daysAgo(1, 8 + i * 2),
        language: rand(['ta', 'ta', 'en']),
      },
    });
  }

  // ─── 3. Fill 14-day trend gaps (days 2-7) ────────────────────────────────
  console.log('Seeding 14-day trend leads…');
  for (let day = 2; day <= 7; day++) {
    const count = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      await prisma.lead.create({
        data: {
          tenantId: HQ,
          name: makeName(),
          phone: phone(),
          city: rand(CITIES),
          stage: rand(['NEW', 'QUALIFIED', 'NOT_ANSWERED', 'FOLLOW_UP'] as const),
          sourceType: rand(SOURCES),
          aiScore: 40 + Math.floor(Math.random() * 55),
          createdAt: daysAgo(day, 8 + i),
          stageChangedAt: daysAgo(day, 8 + i),
          language: rand(['ta', 'ta', 'en']),
        },
      });
    }
  }

  // ─── 4. Calls today (10 calls — 3 personas) ──────────────────────────────
  console.log('Seeding today\'s calls…');
  const callsToday = [
    { persona: 'RESHMA_VERIFY',   hoursBack: 0.5,  dur: 95,  status: 'COMPLETED' },
    { persona: 'RESHMA_VERIFY',   hoursBack: 1.0,  dur: 0,   status: 'NO_ANSWER' },
    { persona: 'RESHMA_VERIFY',   hoursBack: 1.5,  dur: 110, status: 'COMPLETED' },
    { persona: 'RESHMA_VERIFY',   hoursBack: 2.0,  dur: 0,   status: 'NO_ANSWER' },
    { persona: 'RESHMA_VERIFY',   hoursBack: 2.5,  dur: 88,  status: 'COMPLETED' },
    { persona: 'KARTHIK_SALES',   hoursBack: 3.0,  dur: 280, status: 'COMPLETED' },
    { persona: 'KARTHIK_SALES',   hoursBack: 3.5,  dur: 310, status: 'COMPLETED' },
    { persona: 'KARTHIK_SALES',   hoursBack: 4.0,  dur: 0,   status: 'NO_ANSWER' },
    { persona: 'RESHMA_FOLLOWUP', hoursBack: 4.5,  dur: 175, status: 'COMPLETED' },
    { persona: 'RESHMA_FOLLOWUP', hoursBack: 5.0,  dur: 195, status: 'COMPLETED' },
  ];
  for (let i = 0; i < callsToday.length; i++) {
    const c = callsToday[i]!;
    const leadId = rand(convertedLeads.length > 0 ? convertedLeads : [{ id: todayLeads[0]! }]).id;
    const initiatedAt = hoursAgo(c.hoursBack);
    await prisma.call.create({
      data: {
        tenantId: HQ,
        leadId,
        persona: c.persona as 'RESHMA_VERIFY' | 'KARTHIK_SALES' | 'RESHMA_FOLLOWUP',
        direction: 'OUTBOUND',
        fromNumber: '+918800005555',
        toNumber: '+91' + phone(),
        initiatedAt,
        connectedAt: c.dur > 0 ? new Date(initiatedAt.getTime() + 5000) : null,
        endedAt: c.dur > 0 ? new Date(initiatedAt.getTime() + c.dur * 1000) : new Date(initiatedAt.getTime() + 30000),
        durationSec: c.dur > 0 ? c.dur : null,
        status: c.status as 'COMPLETED' | 'NO_ANSWER',
        endReason: c.dur > 0 ? 'completed' : 'no_answer',
      },
    });
  }

  // ─── 5. Calls yesterday (7 calls) ────────────────────────────────────────
  console.log('Seeding yesterday\'s calls…');
  const callsYesterday = [
    { persona: 'RESHMA_VERIFY',   hoursBack: 24, dur: 102, status: 'COMPLETED' },
    { persona: 'RESHMA_VERIFY',   hoursBack: 25, dur: 0,   status: 'NO_ANSWER' },
    { persona: 'RESHMA_VERIFY',   hoursBack: 26, dur: 88,  status: 'COMPLETED' },
    { persona: 'KARTHIK_SALES',   hoursBack: 27, dur: 295, status: 'COMPLETED' },
    { persona: 'KARTHIK_SALES',   hoursBack: 28, dur: 320, status: 'COMPLETED' },
    { persona: 'RESHMA_FOLLOWUP', hoursBack: 29, dur: 180, status: 'COMPLETED' },
    { persona: 'RESHMA_FOLLOWUP', hoursBack: 30, dur: 0,   status: 'NO_ANSWER' },
  ];
  for (const c of callsYesterday) {
    const leadId = rand(convertedLeads.length > 0 ? convertedLeads : [{ id: todayLeads[0]! }]).id;
    const initiatedAt = hoursAgo(c.hoursBack);
    await prisma.call.create({
      data: {
        tenantId: HQ,
        leadId,
        persona: c.persona as 'RESHMA_VERIFY' | 'KARTHIK_SALES' | 'RESHMA_FOLLOWUP',
        direction: 'OUTBOUND',
        fromNumber: '+918800005555',
        toNumber: '+91' + phone(),
        initiatedAt,
        connectedAt: c.dur > 0 ? new Date(initiatedAt.getTime() + 5000) : null,
        endedAt: c.dur > 0 ? new Date(initiatedAt.getTime() + c.dur * 1000) : new Date(initiatedAt.getTime() + 30000),
        durationSec: c.dur > 0 ? c.dur : null,
        status: c.status as 'COMPLETED' | 'NO_ANSWER',
        endReason: c.dur > 0 ? 'completed' : 'no_answer',
      },
    });
  }

  // ─── 6. New franchise tenants ─────────────────────────────────────────────
  console.log('Seeding franchise tenants…');
  const fran2 = await prisma.tenant.upsert({
    where: { id: 'cccccccc-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: 'cccccccc-0000-0000-0000-000000000010',
      name: 'Solar Partners Chennai',
      type: 'FRANCHISE',
      status: 'ACTIVE',
      tier: 'GOLD',
      territory: { cities: ['Chennai', 'Vellore', 'Kanchipuram'] },
      commissionSlabs: [{ minValue: 0, maxValue: 999999999, ratePercent: 6 }],
      contactName: 'Ramesh Iyer',
      contactEmail: 'ramesh@solarpartners.in',
      contactPhone: '+919876500001',
    },
  });
  await prisma.user.upsert({
    where: { email: 'ramesh@solarpartners.in' },
    update: {},
    create: {
      tenantId: fran2.id,
      email: 'ramesh@solarpartners.in',
      name: 'Ramesh Iyer',
      role: 'FRANCHISE_OWNER',
      passwordHash: '$argon2id$v=19$m=65536,t=2,p=1$dummy',
      isActive: true,
    },
  });

  const fran3 = await prisma.tenant.upsert({
    where: { id: 'cccccccc-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: 'cccccccc-0000-0000-0000-000000000011',
      name: 'SunPower Madurai',
      type: 'FRANCHISE',
      status: 'ONBOARDING',
      tier: 'BRONZE',
      territory: { cities: ['Madurai', 'Dindigul'] },
      commissionSlabs: [{ minValue: 0, maxValue: 999999999, ratePercent: 4.5 }],
      contactName: 'Selvam Nadar',
      contactEmail: 'selvam@sunpowermdu.in',
      contactPhone: '+919876500002',
    },
  });

  await prisma.tenant.upsert({
    where: { id: 'cccccccc-0000-0000-0000-000000000012' },
    update: {},
    create: {
      id: 'cccccccc-0000-0000-0000-000000000012',
      name: 'EcoSolar Salem',
      type: 'FRANCHISE',
      status: 'ONBOARDING',
      tier: 'BRONZE',
      territory: { cities: ['Salem', 'Namakkal'] },
      commissionSlabs: [{ minValue: 0, maxValue: 999999999, ratePercent: 4.5 }],
      contactName: 'Vijay Gounder',
      contactEmail: 'vijay@ecosolarsalem.in',
      contactPhone: '+919876500003',
    },
  });

  await prisma.tenant.upsert({
    where: { id: 'cccccccc-0000-0000-0000-000000000013' },
    update: {},
    create: {
      id: 'cccccccc-0000-0000-0000-000000000013',
      name: 'BrightSolar Erode',
      type: 'FRANCHISE',
      status: 'SUSPENDED',
      tier: 'SILVER',
      territory: { cities: ['Erode', 'Tiruppur'] },
      commissionSlabs: [{ minValue: 0, maxValue: 999999999, ratePercent: 5 }],
      contactName: 'Murugan Chettiar',
      contactEmail: 'murugan@brightsolar.in',
      contactPhone: '+919876500004',
    },
  });

  // ─── 7. Pending commissions ───────────────────────────────────────────────
  console.log('Seeding pending commissions…');
  const commLeads = convertedLeads.slice(0, 5);
  const franchiseIds = [FRAN1, fran2.id, fran3.id];
  for (let i = 0; i < commLeads.length; i++) {
    const leadId = commLeads[i]!.id;
    const existing = await prisma.commission.findFirst({ where: { leadId, tenantId: rand(franchiseIds) } });
    if (existing) continue;
    const franchiseTenantId = franchiseIds[i % franchiseIds.length]!;
    await prisma.commission.create({
      data: {
        tenantId: franchiseTenantId,
        leadId,
        grossDealInr: 150000 + i * 50000,
        commissionRatePercent: 5 + (i % 2),
        commissionInr: (150000 + i * 50000) * (5 + (i % 2)) / 100,
        status: 'PENDING_APPROVAL',
        calculatedAt: daysAgo(i + 1, 14),
      },
    });
  }

  // ─── 8. More today's appointments (CONFIRMED + COMPLETED + NO_SHOW) ───────
  console.log('Seeding more today\'s appointments…');
  const todayLeadIds = todayLeads.slice(0, 5);
  if (todayLeadIds.length >= 3) {
    await prisma.appointment.create({
      data: {
        tenantId: HQ,
        leadId: todayLeadIds[0]!,
        scheduledAt: hoursAgo(3),
        durationMin: 60,
        surveyType: 'ROOFTOP_RESIDENTIAL',
        siteAddress: '4 Peelamedu Main Road, Coimbatore 641004',
        siteLat: '11.0268',
        siteLng: '77.0286',
        status: 'COMPLETED',
        completedAt: hoursAgo(2),
        estimatedKw: '5.00',
        roofCondition: 'Good concrete slab, 5 kW feasible',
      },
    });
    await prisma.appointment.create({
      data: {
        tenantId: HQ,
        leadId: todayLeadIds[1]!,
        scheduledAt: hoursAgo(1.5),
        durationMin: 60,
        surveyType: 'ROOFTOP_RESIDENTIAL',
        siteAddress: '12 Saibaba Colony, Coimbatore 641011',
        siteLat: '11.0230',
        siteLng: '76.9401',
        status: 'CONFIRMED',
        confirmedAt: hoursAgo(5),
      },
    });
    await prisma.appointment.create({
      data: {
        tenantId: HQ,
        leadId: todayLeadIds[2]!,
        scheduledAt: hoursFromNow(2),
        durationMin: 90,
        surveyType: 'COMMERCIAL',
        siteAddress: 'SIPCOT Industrial Area, Coimbatore 641021',
        siteLat: '11.0620',
        siteLng: '77.0360',
        status: 'SCHEDULED',
      },
    });
    await prisma.appointment.create({
      data: {
        tenantId: HQ,
        leadId: todayLeadIds[3]!,
        scheduledAt: hoursFromNow(4),
        durationMin: 60,
        surveyType: 'ROOFTOP_RESIDENTIAL',
        siteAddress: '8 RS Puram, Coimbatore 641002',
        siteLat: '11.0053',
        siteLng: '76.9590',
        status: 'SCHEDULED',
      },
    });
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  const [totalLeads, totalCalls, totalAppts, totalTenants, totalComms] = await Promise.all([
    prisma.lead.count({ where: { tenantId: HQ } }),
    prisma.call.count({ where: { tenantId: HQ } }),
    prisma.appointment.count({ where: { tenantId: HQ } }),
    prisma.tenant.count({ where: { type: 'FRANCHISE' } }),
    prisma.commission.count(),
  ]);

  console.log('\n✓ Dashboard seed complete');
  console.log(`  Leads:        ${totalLeads}`);
  console.log(`  Calls:        ${totalCalls}`);
  console.log(`  Appointments: ${totalAppts}`);
  console.log(`  Franchises:   ${totalTenants}`);
  console.log(`  Commissions:  ${totalComms}`);
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`Seed failed: ${String(err)}\n`);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
