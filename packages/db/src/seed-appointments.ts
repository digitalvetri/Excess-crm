import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();
const HQ_TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 3600 * 1000);
}
function daysFromNow(d: number, hour = 10): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  dt.setHours(hour, 0, 0, 0);
  return dt;
}
function daysAgo(d: number, hour = 14): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(hour, 0, 0, 0);
  return dt;
}

async function main() {
  // ── 1. Create engineer users ──────────────────────────────────────────────
  const pw = await argon2.hash('Engineer2024!');
  const engineers = await Promise.all([
    prisma.user.upsert({
      where: { email: 'arjun.n@excessindia.com' },
      update: {},
      create: { tenantId: HQ_TENANT_ID, email: 'arjun.n@excessindia.com', name: 'Arjun Nair', role: 'ENGINEER', passwordHash: pw, isActive: true },
    }),
    prisma.user.upsert({
      where: { email: 'deepa.k@excessindia.com' },
      update: {},
      create: { tenantId: HQ_TENANT_ID, email: 'deepa.k@excessindia.com', name: 'Deepa Kumar', role: 'ENGINEER', passwordHash: pw, isActive: true },
    }),
    prisma.user.upsert({
      where: { email: 'senthil.r@excessindia.com' },
      update: {},
      create: { tenantId: HQ_TENANT_ID, email: 'senthil.r@excessindia.com', name: 'Senthil Raja', role: 'ENGINEER', passwordHash: pw, isActive: true },
    }),
  ]);

  const [arjun, deepa, senthil] = engineers;
  console.log('Engineers created:', engineers.map((e) => e.name).join(', '));

  // ── 2. Get some leads ─────────────────────────────────────────────────────
  const leads = await prisma.lead.findMany({
    where: { tenantId: HQ_TENANT_ID },
    take: 20,
    orderBy: { createdAt: 'desc' },
  });

  if (leads.length === 0) {
    console.log('No leads found — run seed-leads.ts first');
    return;
  }

  // ── 3. Create appointments ────────────────────────────────────────────────
  const apptData = [
    // Today
    { leadIdx: 0,  scheduledAt: hoursFromNow(1),       status: 'CONFIRMED',   engineer: arjun,   type: 'ROOFTOP_RESIDENTIAL', addr: '14/2 Avinashi Road, Coimbatore 641014', lat: '11.0182', lng: '76.9720', durationMin: 60 },
    { leadIdx: 1,  scheduledAt: hoursFromNow(3),       status: 'SCHEDULED',   engineer: deepa,   type: 'ROOFTOP_RESIDENTIAL', addr: '7 Race Course Road, Coimbatore 641018', lat: '11.0031', lng: '76.9658', durationMin: 60 },
    { leadIdx: 2,  scheduledAt: hoursFromNow(5),       status: 'SCHEDULED',   engineer: senthil, type: 'COMMERCIAL',          addr: 'SIDCO Industrial Estate, Coimbatore 641021', lat: '11.0560', lng: '77.0280', durationMin: 90 },
    { leadIdx: 3,  scheduledAt: hoursFromNow(-2),      status: 'COMPLETED',   engineer: arjun,   type: 'ROOFTOP_RESIDENTIAL', addr: '22 Saibaba Colony, Coimbatore 641011', lat: '11.0230', lng: '76.9401', durationMin: 60, estimatedKw: '5.00', roofCondition: 'Good concrete slab — good for 5 kW', completedAt: hoursFromNow(-1) },
    { leadIdx: 4,  scheduledAt: hoursFromNow(-4),      status: 'NO_SHOW',     engineer: deepa,   type: 'ROOFTOP_RESIDENTIAL', addr: '3 Gandhipuram, Coimbatore 641012', lat: '11.0185', lng: '76.9560', durationMin: 60, noShowAt: hoursFromNow(-3) },
    // Tomorrow
    { leadIdx: 5,  scheduledAt: daysFromNow(1, 9),     status: 'SCHEDULED',   engineer: arjun,   type: 'ROOFTOP_RESIDENTIAL', addr: '5 Peelamedu, Coimbatore 641004', lat: '11.0268', lng: '77.0286', durationMin: 60 },
    { leadIdx: 6,  scheduledAt: daysFromNow(1, 11),    status: 'CONFIRMED',   engineer: deepa,   type: 'INDUSTRIAL',          addr: 'SIPCOT Phase II, Coimbatore 641021', lat: '11.0620', lng: '77.0360', durationMin: 120 },
    { leadIdx: 7,  scheduledAt: daysFromNow(1, 14),    status: 'SCHEDULED',   engineer: senthil, type: 'ROOFTOP_RESIDENTIAL', addr: '18 Sowripalayam, Coimbatore 641028', lat: '10.9980', lng: '77.0110', durationMin: 60 },
    { leadIdx: 8,  scheduledAt: daysFromNow(1, 16),    status: 'SCHEDULED',   engineer: null,    type: 'OFFGRID',             addr: '9 Kinathukadavu, Coimbatore 642109', lat: '10.8900', lng: '77.0420', durationMin: 90 },
    // Day after tomorrow
    { leadIdx: 9,  scheduledAt: daysFromNow(2, 10),    status: 'SCHEDULED',   engineer: arjun,   type: 'COMMERCIAL',          addr: 'Tidel Park, Coimbatore 641014', lat: '11.0210', lng: '76.9710', durationMin: 90 },
    { leadIdx: 10, scheduledAt: daysFromNow(2, 15),    status: 'SCHEDULED',   engineer: senthil, type: 'ROOFTOP_RESIDENTIAL', addr: '4 RS Puram, Coimbatore 641002', lat: '11.0053', lng: '76.9590', durationMin: 60 },
    { leadIdx: 11, scheduledAt: daysFromNow(3, 9),     status: 'SCHEDULED',   engineer: deepa,   type: 'ROOFTOP_RESIDENTIAL', addr: '11 Vadavalli, Coimbatore 641041', lat: '11.0156', lng: '76.9060', durationMin: 60 },
    // Past — this week
    { leadIdx: 12, scheduledAt: daysAgo(1, 10),        status: 'COMPLETED',   engineer: senthil, type: 'ROOFTOP_RESIDENTIAL', addr: '6 Podanur, Coimbatore 641023', lat: '10.9700', lng: '76.9700', durationMin: 60, estimatedKw: '3.50', roofCondition: 'Tiled roof — requires mounting frames', completedAt: daysAgo(1, 11) },
    { leadIdx: 13, scheduledAt: daysAgo(1, 14),        status: 'COMPLETED',   engineer: arjun,   type: 'COMMERCIAL',          addr: 'Brookefields Mall, Coimbatore 641044', lat: '11.0070', lng: '76.9740', durationMin: 90, estimatedKw: '20.00', roofCondition: 'Excellent flat roof — 20 kW feasible', completedAt: daysAgo(1, 16) },
    { leadIdx: 14, scheduledAt: daysAgo(2, 11),        status: 'CANCELLED',   engineer: deepa,   type: 'ROOFTOP_RESIDENTIAL', addr: '2 Ukkadam, Coimbatore 641001', lat: '11.0050', lng: '76.9620', durationMin: 60, cancelReason: 'Customer requested postponement' },
  ] as const;

  let created = 0;
  for (const a of apptData) {
    const lead = leads[a.leadIdx % leads.length];
    if (!lead) continue;

    await prisma.appointment.create({
      data: {
        tenantId: HQ_TENANT_ID,
        leadId: lead.id,
        scheduledAt: a.scheduledAt,
        durationMin: a.durationMin,
        surveyType: a.type,
        siteAddress: a.addr,
        siteLat: a.lat ?? null,
        siteLng: a.lng ?? null,
        assignedEngineerId: a.engineer?.id ?? null,
        status: a.status as 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED',
        estimatedKw: 'estimatedKw' in a ? String(a.estimatedKw) : null,
        roofCondition: 'roofCondition' in a ? a.roofCondition : null,
        cancelReason: 'cancelReason' in a ? a.cancelReason : null,
        completedAt: 'completedAt' in a ? a.completedAt : null,
        noShowAt: 'noShowAt' in a ? a.noShowAt : null,
        confirmedAt: a.status === 'CONFIRMED' ? new Date(a.scheduledAt.getTime() - 3600000) : null,
      },
    });
    created++;
  }

  console.log(`Created ${created} appointments`);
  console.log('Login: admin@excessindia.com / ExcessAdmin2024!');
  console.log('App: http://localhost:3000/appointments');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
