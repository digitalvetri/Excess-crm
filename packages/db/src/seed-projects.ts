import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT = 'aaaaaaaa-0000-0000-0000-000000000001';

function daysAgo(d: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt;
}

function prjNum(n: number): string {
  return `PRJ-202504-${n.toString(16).toUpperCase().padStart(4, '0')}`;
}

async function main() {
  const leads = await prisma.lead.findMany({
    where: { tenantId: TENANT },
    take: 12,
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });

  if (leads.length < 8) {
    console.log('Run seed-leads.ts first');
    return;
  }

  const engineers = await prisma.user.findMany({
    where: { tenantId: TENANT, role: 'ENGINEER' },
    select: { id: true },
  });

  const engId = engineers[0]?.id ?? null;

  const projectDefs = [
    {
      lead: leads[0]!, stage: 'SURVEY', kw: '3.00', val: '185000',
      stageChangedAt: daysAgo(2), createdAt: daysAgo(10),
      subsidy: 'NONE' as const, nmStatus: 'NOT_APPLIED' as const,
    },
    {
      lead: leads[1]!, stage: 'SURVEY', kw: '5.00', val: '295000',
      stageChangedAt: daysAgo(9), createdAt: daysAgo(20),
      subsidy: 'PM_SURYA_GHAR' as const, subsidyStatus: 'NOT_APPLIED' as const,
      nmStatus: 'NOT_APPLIED' as const,
    },
    {
      lead: leads[2]!, stage: 'DESIGN', kw: '5.00', val: '310000',
      stageChangedAt: daysAgo(4), createdAt: daysAgo(18),
      surveyDoneAt: daysAgo(4),
      subsidy: 'PM_SURYA_GHAR' as const, subsidyStatus: 'APPLIED' as const,
      subsidyAppRef: 'PMSG-TN-2025-08432', subsidyAppliedAt: daysAgo(3),
      nmStatus: 'NOT_APPLIED' as const,
      payments: [{ type: 'ADVANCE', amt: 62000, receivedAt: daysAgo(16) }],
    },
    {
      lead: leads[3]!, stage: 'MATERIAL_ORDERED', kw: '10.00', val: '580000',
      stageChangedAt: daysAgo(3), createdAt: daysAgo(25),
      surveyDoneAt: daysAgo(15), designApprovedAt: daysAgo(10), materialOrderedAt: daysAgo(3),
      subsidy: 'STATE_TEDA' as const, subsidyStatus: 'DISCOM_INSPECTION_SCHEDULED' as const,
      nmStatus: 'SLD_SUBMITTED' as const, nmAppRef: 'TNEB-CBE-2025-5521',
      payments: [
        { type: 'ADVANCE', amt: 116000, receivedAt: daysAgo(22) },
        { type: 'MATERIALS', amt: 174000, receivedAt: daysAgo(5) },
      ],
    },
    {
      lead: leads[4]!, stage: 'INSTALLATION', kw: '7.50', val: '435000',
      stageChangedAt: daysAgo(5), createdAt: daysAgo(40),
      surveyDoneAt: daysAgo(30), designApprovedAt: daysAgo(22),
      materialOrderedAt: daysAgo(18), installStartedAt: daysAgo(5),
      subsidy: 'PM_SURYA_GHAR' as const, subsidyStatus: 'DISCOM_APPROVED' as const,
      subsidyAppRef: 'PMSG-TN-2025-07219', subsidyAppliedAt: daysAgo(20),
      nmStatus: 'LOAD_SANCTION_APPLIED' as const,
      payments: [
        { type: 'ADVANCE', amt: 87000, receivedAt: daysAgo(38) },
        { type: 'MATERIALS', amt: 130500, receivedAt: daysAgo(15) },
        { type: 'INSTALLATION', amt: 87000, receivedAt: daysAgo(6) },
      ],
    },
    {
      lead: leads[5]!, stage: 'INSTALLATION', kw: '3.00', val: '195000',
      stageChangedAt: daysAgo(22), createdAt: daysAgo(60),
      surveyDoneAt: daysAgo(50), designApprovedAt: daysAgo(42),
      materialOrderedAt: daysAgo(35), installStartedAt: daysAgo(22),
      subsidy: 'NONE' as const, nmStatus: 'INSPECTION_DONE' as const,
      payments: [
        { type: 'ADVANCE', amt: 39000, receivedAt: daysAgo(58) },
        { type: 'MATERIALS', amt: 58500, receivedAt: daysAgo(32) },
      ],
    },
    {
      lead: leads[6]!, stage: 'COMMISSIONING', kw: '5.00', val: '285000',
      stageChangedAt: daysAgo(1), createdAt: daysAgo(45),
      surveyDoneAt: daysAgo(38), designApprovedAt: daysAgo(30),
      materialOrderedAt: daysAgo(25), installStartedAt: daysAgo(12), commissionedAt: daysAgo(1),
      subsidy: 'PM_SURYA_GHAR' as const, subsidyStatus: 'PORTAL_UPLOAD_DONE' as const,
      subsidyAppRef: 'PMSG-TN-2025-06891', subsidyAppliedAt: daysAgo(28),
      nmStatus: 'METER_CHANGED' as const,
      payments: [
        { type: 'ADVANCE', amt: 57000, receivedAt: daysAgo(43) },
        { type: 'MATERIALS', amt: 85500, receivedAt: daysAgo(22) },
        { type: 'INSTALLATION', amt: 57000, receivedAt: daysAgo(10) },
      ],
    },
    {
      lead: leads[7]!, stage: 'HANDED_OVER', kw: '3.00', val: '178000',
      stageChangedAt: daysAgo(5), createdAt: daysAgo(70),
      surveyDoneAt: daysAgo(62), designApprovedAt: daysAgo(55),
      materialOrderedAt: daysAgo(48), installStartedAt: daysAgo(22), commissionedAt: daysAgo(8),
      handedOverAt: daysAgo(5),
      subsidy: 'PM_SURYA_GHAR' as const, subsidyStatus: 'CREDITED' as const,
      subsidyAppRef: 'PMSG-TN-2025-04112', subsidyAppliedAt: daysAgo(50),
      subsidyCreditedAt: daysAgo(10), subsidyCreditedAmtInr: 18000,
      nmStatus: 'ACTIVE' as const,
      panelWarrantyYears: 25, inverterWarrantyYears: 5, installWarrantyYears: 1,
      warrantyStartDate: daysAgo(5),
      payments: [
        { type: 'ADVANCE', amt: 35600, receivedAt: daysAgo(68) },
        { type: 'MATERIALS', amt: 53400, receivedAt: daysAgo(45) },
        { type: 'INSTALLATION', amt: 35600, receivedAt: daysAgo(20) },
        { type: 'COMPLETION', amt: 35400, receivedAt: daysAgo(6) },
        { type: 'SUBSIDY', amt: 18000, receivedAt: daysAgo(10) },
      ],
    },
    {
      lead: leads[8]!, stage: 'HANDED_OVER', kw: '10.00', val: '620000',
      stageChangedAt: daysAgo(12), createdAt: daysAgo(90),
      surveyDoneAt: daysAgo(80), designApprovedAt: daysAgo(70),
      materialOrderedAt: daysAgo(62), installStartedAt: daysAgo(35), commissionedAt: daysAgo(15),
      handedOverAt: daysAgo(12),
      subsidy: 'STATE_TEDA' as const, subsidyStatus: 'CREDITED' as const,
      nmStatus: 'ACTIVE' as const,
      payments: [
        { type: 'ADVANCE', amt: 124000, receivedAt: daysAgo(88) },
        { type: 'MATERIALS', amt: 186000, receivedAt: daysAgo(60) },
        { type: 'INSTALLATION', amt: 124000, receivedAt: daysAgo(30) },
        { type: 'COMPLETION', amt: 124000, receivedAt: daysAgo(13) },
        { type: 'SUBSIDY', amt: 62000, receivedAt: daysAgo(15) },
      ],
    },
  ] as const;

  let created = 0;

  for (let i = 0; i < projectDefs.length; i++) {
    const d = projectDefs[i]!;

    const existing = await prisma.project.findFirst({
      where: { tenantId: TENANT, leadId: d.lead.id },
      select: { id: true },
    });
    if (existing) continue;

    const project = await prisma.project.create({
      data: {
        tenantId: TENANT,
        leadId: d.lead.id,
        number: prjNum(i + 1),
        stage: d.stage as 'SURVEY' | 'DESIGN' | 'MATERIAL_ORDERED' | 'INSTALLATION' | 'COMMISSIONING' | 'HANDED_OVER',
        stageChangedAt: d.stageChangedAt,
        systemKw: d.kw,
        totalValueInr: d.val,
        assignedEngineerId: engId,
        createdAt: d.createdAt,
        // Stage timestamps
        ...('surveyDoneAt' in d && { surveyDoneAt: d.surveyDoneAt }),
        ...('designApprovedAt' in d && { designApprovedAt: d.designApprovedAt }),
        ...('materialOrderedAt' in d && { materialOrderedAt: d.materialOrderedAt }),
        ...('installStartedAt' in d && { installStartedAt: d.installStartedAt }),
        ...('commissionedAt' in d && { commissionedAt: d.commissionedAt }),
        ...('handedOverAt' in d && { handedOverAt: d.handedOverAt }),
        // Subsidy
        subsidyScheme: d.subsidy,
        ...('subsidyStatus' in d && { subsidyStatus: d.subsidyStatus }),
        ...('subsidyAppRef' in d && { subsidyAppRef: d.subsidyAppRef }),
        ...('subsidyAppliedAt' in d && { subsidyAppliedAt: d.subsidyAppliedAt }),
        ...('subsidyCreditedAt' in d && { subsidyCreditedAt: d.subsidyCreditedAt }),
        ...('subsidyCreditedAmtInr' in d && { subsidyCreditedAmtInr: d.subsidyCreditedAmtInr }),
        // Net metering
        netMeteringStatus: d.nmStatus,
        ...('nmAppRef' in d && { netMeteringAppRef: d.nmAppRef }),
        // Warranty
        ...('panelWarrantyYears' in d && { panelWarrantyYears: d.panelWarrantyYears }),
        ...('inverterWarrantyYears' in d && { inverterWarrantyYears: d.inverterWarrantyYears }),
        ...('installWarrantyYears' in d && { installWarrantyYears: d.installWarrantyYears }),
        ...('warrantyStartDate' in d && { warrantyStartDate: d.warrantyStartDate }),
      },
    });

    if ('payments' in d && d.payments.length > 0) {
      for (const pay of d.payments) {
        await prisma.projectPayment.create({
          data: {
            tenantId: TENANT,
            projectId: project.id,
            type: pay.type as 'ADVANCE' | 'MATERIALS' | 'INSTALLATION' | 'COMPLETION' | 'SUBSIDY' | 'AMC' | 'OTHER',
            amountInr: pay.amt,
            receivedAt: pay.receivedAt,
            method: 'BANK_TRANSFER',
            recordedByUserId: (await prisma.user.findFirst({ where: { tenantId: TENANT, role: 'ADMIN' }, select: { id: true } }))!.id,
          },
        });
      }
    }

    created++;
  }

  console.log(`Created ${created} projects with payments`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
