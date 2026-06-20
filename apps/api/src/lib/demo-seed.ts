import { randomUUID } from 'node:crypto';
import { prisma, withSystemContext } from '@excess/db';

// TEMPORARY one-shot demo-data seeder, triggered by the admin-only POST
// /admin/seed-demo endpoint. Self-contained (no process.exit, no extra Prisma
// client) so it is safe to run inside the live API process. Remove after use.

const HQ = 'aaaaaaaa-0000-0000-0000-000000000001';

const SRC = {
  META: 'cccccccc-3333-0000-0000-000000000003',
  JUSTDIAL: 'cccccccc-1111-0000-0000-000000000001',
  INDIAMART: 'cccccccc-2222-0000-0000-000000000002',
} as const;

const PINCODES: Record<string, string> = {
  Coimbatore: '641001', Tiruppur: '641601', Erode: '638001',
  Salem: '636001', Madurai: '625001', Chennai: '600001', Trichy: '620001',
};

function hoursAgo(h: number): Date { return new Date(Date.now() - h * 3_600_000); }
function daysAgo(d: number): Date { return new Date(Date.now() - d * 86_400_000); }

interface LeadDef {
  name: string; phone: string; email: string | null; city: string;
  stage: 'NEW' | 'QUALIFIED' | 'FOLLOW_UP' | 'CONVERTED' | 'NOT_ANSWERED' | 'INVALID';
  source: keyof typeof SRC; aiScore: number | null; createdAt: Date;
}

const LEADS: LeadDef[] = [
  // NEW (8)
  { name: 'Rajesh Kumar',     phone: '9876543101', email: 'rajesh.k@gmail.com',  city: 'Coimbatore', stage: 'NEW', source: 'META',      aiScore: 82, createdAt: hoursAgo(2) },
  { name: 'Priya Natarajan',  phone: '9876543102', email: null,                  city: 'Chennai',    stage: 'NEW', source: 'JUSTDIAL',  aiScore: 67, createdAt: hoursAgo(3) },
  { name: 'Suresh Gounder',   phone: '9876543103', email: 'suresh.g@yahoo.in',   city: 'Erode',      stage: 'NEW', source: 'INDIAMART', aiScore: 74, createdAt: hoursAgo(5) },
  { name: 'Kavitha Pillai',   phone: '9876543104', email: null,                  city: 'Madurai',    stage: 'NEW', source: 'META',      aiScore: 91, createdAt: hoursAgo(1) },
  { name: 'Arjun Krishnan',   phone: '9876543105', email: 'arjun.k@outlook.com', city: 'Coimbatore', stage: 'NEW', source: 'META',      aiScore: 63, createdAt: hoursAgo(8) },
  { name: 'Deepa Rajan',      phone: '9876543106', email: null,                  city: 'Tiruppur',   stage: 'NEW', source: 'INDIAMART', aiScore: 88, createdAt: hoursAgo(7) },
  { name: 'Senthil Murugan',  phone: '9876543107', email: 'senthil.m@gmail.com', city: 'Salem',      stage: 'NEW', source: 'JUSTDIAL',  aiScore: 55, createdAt: hoursAgo(12) },
  { name: 'Lakshmi Iyer',     phone: '9876543108', email: null,                  city: 'Trichy',     stage: 'NEW', source: 'META',      aiScore: 71, createdAt: hoursAgo(10) },
  // QUALIFIED (5)
  { name: 'Karthik Subramani', phone: '9876543109', email: 'karthik.s@gmail.com', city: 'Coimbatore', stage: 'QUALIFIED', source: 'META',      aiScore: 86, createdAt: daysAgo(2) },
  { name: 'Anitha Sharma',     phone: '9876543110', email: 'anitha.s@gmail.com',  city: 'Chennai',    stage: 'QUALIFIED', source: 'INDIAMART', aiScore: 79, createdAt: daysAgo(3) },
  { name: 'Vignesh Babu',      phone: '9876543111', email: null,                  city: 'Tiruppur',   stage: 'QUALIFIED', source: 'JUSTDIAL',  aiScore: 84, createdAt: daysAgo(4) },
  { name: 'Meena Sundaram',    phone: '9876543112', email: 'meena.s@yahoo.in',    city: 'Erode',      stage: 'QUALIFIED', source: 'META',      aiScore: 72, createdAt: daysAgo(2) },
  { name: 'Ramesh Pandian',    phone: '9876543113', email: null,                  city: 'Madurai',    stage: 'QUALIFIED', source: 'META',      aiScore: 90, createdAt: daysAgo(5) },
  // FOLLOW_UP (4)
  { name: 'Gokul Raman',       phone: '9876543114', email: 'gokul.r@gmail.com',   city: 'Coimbatore', stage: 'FOLLOW_UP', source: 'INDIAMART', aiScore: 68, createdAt: daysAgo(6) },
  { name: 'Divya Venkatesh',   phone: '9876543115', email: null,                  city: 'Salem',      stage: 'FOLLOW_UP', source: 'META',      aiScore: 75, createdAt: daysAgo(7) },
  { name: 'Prakash Nair',      phone: '9876543116', email: 'prakash.n@gmail.com', city: 'Chennai',    stage: 'FOLLOW_UP', source: 'JUSTDIAL',  aiScore: 81, createdAt: daysAgo(8) },
  { name: 'Sangeetha Mohan',   phone: '9876543117', email: null,                  city: 'Trichy',     stage: 'FOLLOW_UP', source: 'META',      aiScore: 64, createdAt: daysAgo(5) },
  // CONVERTED (4) — these get projects
  { name: 'Bala Chandran',     phone: '9876543118', email: 'bala.c@gmail.com',    city: 'Coimbatore', stage: 'CONVERTED', source: 'META',      aiScore: 94, createdAt: daysAgo(20) },
  { name: 'Revathi Krishnan',  phone: '9876543119', email: 'revathi.k@gmail.com', city: 'Tiruppur',   stage: 'CONVERTED', source: 'INDIAMART', aiScore: 89, createdAt: daysAgo(35) },
  { name: 'Manikandan Selvam', phone: '9876543120', email: null,                  city: 'Erode',      stage: 'CONVERTED', source: 'JUSTDIAL',  aiScore: 92, createdAt: daysAgo(50) },
  { name: 'Janani Murthy',     phone: '9876543121', email: 'janani.m@gmail.com',  city: 'Madurai',    stage: 'CONVERTED', source: 'META',      aiScore: 87, createdAt: daysAgo(70) },
  // NOT_ANSWERED (2)
  { name: 'Hari Prasad',       phone: '9876543122', email: null,                  city: 'Salem',      stage: 'NOT_ANSWERED', source: 'JUSTDIAL', aiScore: 41, createdAt: daysAgo(3) },
  { name: 'Sowmya Ravi',       phone: '9876543123', email: null,                  city: 'Coimbatore', stage: 'NOT_ANSWERED', source: 'INDIAMART', aiScore: 38, createdAt: daysAgo(4) },
];

// Project stage + sizing for each CONVERTED lead (by index into the converted set)
const PROJECTS = [
  { stage: 'SURVEY' as const,       kw: 3,  val: 210000, daysOld: 20 },
  { stage: 'INSTALLATION' as const, kw: 5,  val: 350000, daysOld: 35 },
  { stage: 'COMMISSIONING' as const, kw: 8, val: 540000, daysOld: 50 },
  { stage: 'HANDED_OVER' as const,  kw: 10, val: 680000, daysOld: 70 },
];

export interface DemoSeedResult {
  alreadySeeded: boolean;
  leads: number;
  projects: number;
  appointments: number;
}

export async function seedDemoData(): Promise<DemoSeedResult> {
  // Idempotency guard: if the tenant already has a real dataset, do nothing.
  const existingLeads = await withSystemContext(prisma, HQ, (tx) =>
    tx.lead.count({ where: { tenantId: HQ } }),
  );
  if (existingLeads > 10) {
    return { alreadySeeded: true, leads: existingLeads, projects: 0, appointments: 0 };
  }

  // 1) Lead sources (upsert by fixed id) — one small txn
  await withSystemContext(prisma, HQ, async (tx) => {
    for (const [type, id] of Object.entries(SRC)) {
      await tx.leadSource.upsert({
        where: { id },
        update: {},
        create: { id, tenantId: HQ, type: type as 'META' | 'JUSTDIAL' | 'INDIAMART', label: type, isActive: true },
      });
    }
  });

  // 2) Leads — bulk createMany (single fast statement, no txn timeout risk)
  const leadRows = LEADS.map((d) => ({
    id: randomUUID(),
    tenantId: HQ,
    name: d.name,
    phone: d.phone,
    phoneRaw: d.phone,
    email: d.email,
    city: d.city,
    pincode: PINCODES[d.city] ?? null,
    stage: d.stage,
    stageChangedAt: d.stage === 'NEW' ? d.createdAt : daysAgo(1),
    sourceType: d.source,
    sourceId: SRC[d.source],
    aiScore: d.aiScore,
    receivedAt: d.createdAt,
    createdAt: d.createdAt,
    firstContactedAt: d.stage === 'NEW' || d.stage === 'NOT_ANSWERED' ? null : new Date(d.createdAt.getTime() + 3_600_000),
  }));

  await withSystemContext(prisma, HQ, (tx) =>
    tx.lead.createMany({ data: leadRows, skipDuplicates: true }),
  );

  // 3) Projects for the CONVERTED leads — one small txn
  const converted = LEADS
    .map((d, i) => ({ d, id: leadRows[i]!.id }))
    .filter((x) => x.d.stage === 'CONVERTED');

  let projectCount = 0;
  await withSystemContext(prisma, HQ, async (tx) => {
    for (let i = 0; i < converted.length; i++) {
      const p = PROJECTS[i] ?? PROJECTS[0]!;
      await tx.project.create({
        data: {
          tenantId: HQ,
          leadId: converted[i]!.id,
          number: `PRJ-${String(1001 + i)}`,
          stage: p.stage,
          stageChangedAt: daysAgo(Math.floor(p.daysOld / 2)),
          systemKw: p.kw,
          totalValueInr: p.val,
          createdAt: daysAgo(p.daysOld),
        },
      });
      projectCount++;
    }
  });

  // 4) Appointments for the first few QUALIFIED / FOLLOW_UP leads — one small txn
  const apptLeads = LEADS
    .map((d, i) => ({ d, id: leadRows[i]!.id }))
    .filter((x) => x.d.stage === 'QUALIFIED' || x.d.stage === 'FOLLOW_UP')
    .slice(0, 6);

  let apptCount = 0;
  await withSystemContext(prisma, HQ, async (tx) => {
    for (let i = 0; i < apptLeads.length; i++) {
      const future = i % 2 === 0;
      await tx.appointment.create({
        data: {
          tenantId: HQ,
          leadId: apptLeads[i]!.id,
          scheduledAt: future ? new Date(Date.now() + (i + 1) * 86_400_000) : daysAgo(i + 1),
          durationMin: 60,
          surveyType: 'ROOFTOP_RESIDENTIAL',
          siteAddress: `${apptLeads[i]!.d.city}, Tamil Nadu`,
          status: future ? 'SCHEDULED' : 'COMPLETED',
          estimatedKw: '5',
          completedAt: future ? null : daysAgo(i + 1),
        },
      });
      apptCount++;
    }
  });

  return { alreadySeeded: false, leads: leadRows.length, projects: projectCount, appointments: apptCount };
}
