import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const HQ_TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3600 * 1000);
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// ─── Raw data pools ───────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Rajesh', 'Suresh', 'Priya', 'Kavitha', 'Murugan', 'Lakshmi', 'Arjun',
  'Deepa', 'Selvam', 'Anitha', 'Karthik', 'Meena', 'Senthil', 'Padma',
  'Vijay', 'Rekha', 'Balamurugan', 'Saranya', 'Dinesh', 'Geetha',
  'Manoj', 'Usha', 'Prakash', 'Nirmala', 'Venkatesh', 'Janaki',
  'Srinivasan', 'Sumathi', 'Ramesh', 'Malathi', 'Ganesh', 'Vimala',
  'Subramaniam', 'Revathi', 'Chandran', 'Mythili', 'Muthukumar', 'Shanthi',
  'Prabhu', 'Kala', 'Ravi', 'Vasantha', 'Mohan', 'Hema', 'Arun',
  'Bharathi', 'Gopal', 'Indira', 'Sundar', 'Jayalakshmi',
];

const LAST_NAMES = [
  'Kumar', 'Raj', 'Krishnan', 'Murugesan', 'Rajan', 'Selvam', 'Natarajan',
  'Subramanian', 'Venkataraman', 'Pillai', 'Nadar', 'Gounder', 'Chettiar',
  'Reddy', 'Sharma', 'Patel', 'Singh', 'Nair', 'Menon', 'Iyer',
];

const CITIES = [
  'Coimbatore', 'Chennai', 'Bangalore', 'Madurai', 'Trichy', 'Salem',
  'Tiruppur', 'Erode', 'Vellore', 'Hyderabad', 'Pune', 'Kochi',
];

const PINCODES: Record<string, string> = {
  Coimbatore: '641001',
  Chennai: '600001',
  Bangalore: '560001',
  Madurai: '625001',
  Trichy: '620001',
  Salem: '636001',
  Tiruppur: '641601',
  Erode: '638001',
  Vellore: '632001',
  Hyderabad: '500001',
  Pune: '411001',
  Kochi: '682001',
};

const CAMPAIGN_NAMES = [
  'Solar_Rooftop_Q1_2026', 'SolarSubsidy_Mar2026', 'PMSuryaGhar_Lead',
  'RooftopSolar_Coimbatore', 'SolarLead_Q2', 'SubsidySolar2026',
  'SolarInstall_Tamil', null, null, null,
];

const AD_NAMES = [
  '3kW_Subsidy_Video', '5kW_ROI_Carousel', 'SolarSavings_Reel',
  'KWhToRs_Calculator', 'FreeSiteVisit_Offer', null, null,
];

function makePhone(): string {
  const prefixes = ['98', '97', '96', '95', '94', '93', '92', '91', '90', '89', '88', '87', '86', '85', '84', '83', '82', '81', '80', '79', '78', '77', '76'];
  const prefix = randomItem(prefixes);
  const suffix = String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
  return `${prefix}${suffix}`;
}

function makeName(): string {
  return `${randomItem(FIRST_NAMES)} ${randomItem(LAST_NAMES)}`;
}

function makeEmail(name: string): string | null {
  if (Math.random() < 0.4) return null; // 40% no email
  const clean = name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '');
  const domains = ['gmail.com', 'yahoo.co.in', 'outlook.com', 'rediffmail.com'];
  return `${clean}${Math.floor(Math.random() * 99)}@${randomItem(domains)}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Create lead sources
  const justdialSource = await prisma.leadSource.upsert({
    where: { id: 'cccccccc-1111-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'cccccccc-1111-0000-0000-000000000001',
      tenantId: HQ_TENANT_ID,
      type: 'JUSTDIAL',
      label: 'JustDial',
      config: { secret: 'jd-demo-secret-key-2024', webhookUrl: 'http://localhost:8000/webhooks/justdial' },
      isActive: true,
      lastSyncAt: daysAgo(1),
    },
  });

  const indiamartSource = await prisma.leadSource.upsert({
    where: { id: 'cccccccc-2222-0000-0000-000000000002' },
    update: {},
    create: {
      id: 'cccccccc-2222-0000-0000-000000000002',
      tenantId: HQ_TENANT_ID,
      type: 'INDIAMART',
      label: 'IndiaMART',
      config: { apiKey: 'im-demo-api-key-2024', mobile: '9876543210', pullFrequency: 'daily' },
      isActive: true,
      lastSyncAt: hoursAgo(3),
    },
  });

  const metaSource = await prisma.leadSource.upsert({
    where: { id: 'cccccccc-3333-0000-0000-000000000003' },
    update: {},
    create: {
      id: 'cccccccc-3333-0000-0000-000000000003',
      tenantId: HQ_TENANT_ID,
      type: 'META',
      label: 'Meta Lead Ads',
      config: {
        pageId: '123456789',
        pageName: 'Excess Solar Energy',
        hasToken: true,
        fieldMapping: { full_name: 'name', phone_number: 'phone', email: 'email', city: 'city' },
      },
      isActive: true,
      lastSyncAt: hoursAgo(1),
    },
  });

  // Get the admin user id
  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@excessindia.com' } });
  const adminUserId = adminUser?.id ?? null;

  // 2. Lead definitions: 60 leads across all stages and sources
  const leadDefs: {
    name: string;
    phone: string;
    email: string | null;
    city: string;
    stage: 'NEW' | 'QUALIFIED' | 'FOLLOW_UP' | 'CONVERTED' | 'NOT_ANSWERED' | 'INVALID' | 'WRONG_ENQUIRY';
    sourceType: 'JUSTDIAL' | 'INDIAMART' | 'META' | 'WEBSITE' | 'WHATSAPP' | 'MANUAL';
    sourceId: string | null;
    aiScore: number | null;
    campaignName: string | null;
    adName: string | null;
    createdAt: Date;
    ownerUserId: string | null;
    language: string;
    factSheet: object | null;
    isDuplicate: boolean;
  }[] = [
    // ── NEW leads (most recent, not yet contacted) ──
    { name: 'Rajesh Kumar', phone: '9876543001', email: 'rajesh.kumar01@gmail.com', city: 'Coimbatore', stage: 'NEW', sourceType: 'META', sourceId: metaSource.id, aiScore: 82, campaignName: 'Solar_Rooftop_Q1_2026', adName: '3kW_Subsidy_Video', createdAt: hoursAgo(2), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Priya Natarajan', phone: '9876543002', email: null, city: 'Chennai', stage: 'NEW', sourceType: 'JUSTDIAL', sourceId: justdialSource.id, aiScore: 67, campaignName: null, adName: null, createdAt: hoursAgo(3), ownerUserId: null, language: 'ta-en', factSheet: null, isDuplicate: false },
    { name: 'Suresh Gounder', phone: '9876543003', email: 'suresh.g99@yahoo.co.in', city: 'Erode', stage: 'NEW', sourceType: 'INDIAMART', sourceId: indiamartSource.id, aiScore: 74, campaignName: null, adName: null, createdAt: hoursAgo(4), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Kavitha Pillai', phone: '9876543004', email: null, city: 'Madurai', stage: 'NEW', sourceType: 'META', sourceId: metaSource.id, aiScore: 91, campaignName: 'SolarSubsidy_Mar2026', adName: '5kW_ROI_Carousel', createdAt: hoursAgo(1), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Murugan Selvam', phone: '9876543005', email: null, city: 'Tiruppur', stage: 'NEW', sourceType: 'JUSTDIAL', sourceId: justdialSource.id, aiScore: 55, campaignName: null, adName: null, createdAt: hoursAgo(5), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Anitha Sharma', phone: '9876543006', email: 'anitha.sharma06@gmail.com', city: 'Salem', stage: 'NEW', sourceType: 'META', sourceId: metaSource.id, aiScore: 78, campaignName: 'PMSuryaGhar_Lead', adName: 'SolarSavings_Reel', createdAt: hoursAgo(6), ownerUserId: null, language: 'en', factSheet: null, isDuplicate: false },
    { name: 'Deepa Rajan', phone: '9876543007', email: null, city: 'Coimbatore', stage: 'NEW', sourceType: 'INDIAMART', sourceId: indiamartSource.id, aiScore: 88, campaignName: null, adName: null, createdAt: hoursAgo(7), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Arjun Krishnan', phone: '9876543008', email: 'arjun.k08@outlook.com', city: 'Bangalore', stage: 'NEW', sourceType: 'META', sourceId: metaSource.id, aiScore: 63, campaignName: 'RooftopSolar_Coimbatore', adName: 'FreeSiteVisit_Offer', createdAt: hoursAgo(8), ownerUserId: null, language: 'en', factSheet: null, isDuplicate: false },
    { name: 'Lakshmi Iyer', phone: '9876543009', email: null, city: 'Trichy', stage: 'NEW', sourceType: 'WEBSITE', sourceId: null, aiScore: null, campaignName: null, adName: null, createdAt: hoursAgo(10), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Senthil Murugesan', phone: '9876543010', email: 'senthil.m10@gmail.com', city: 'Coimbatore', stage: 'NEW', sourceType: 'WHATSAPP', sourceId: null, aiScore: 71, campaignName: null, adName: null, createdAt: hoursAgo(12), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },

    // ── QUALIFIED leads ──
    { name: 'Karthik Venkataraman', phone: '9876543011', email: 'karthik.v11@gmail.com', city: 'Coimbatore', stage: 'QUALIFIED', sourceType: 'META', sourceId: metaSource.id, aiScore: 85, campaignName: 'Solar_Rooftop_Q1_2026', adName: '5kW_ROI_Carousel', createdAt: daysAgo(2), ownerUserId: adminUserId, language: 'ta-en', factSheet: { roofType: 'concrete', monthlyBill: '₹4,500', budgetRange: '₹2-3L', urgency: 'this_month', decisionMaker: 'self', painPoint: 'high_bill' }, isDuplicate: false },
    { name: 'Meena Subramanian', phone: '9876543012', email: null, city: 'Chennai', stage: 'QUALIFIED', sourceType: 'INDIAMART', sourceId: indiamartSource.id, aiScore: 79, campaignName: null, adName: null, createdAt: daysAgo(3), ownerUserId: adminUserId, language: 'en', factSheet: { roofType: 'concrete', monthlyBill: '₹6,000', budgetRange: '₹3-4L', urgency: 'this_quarter', decisionMaker: 'self', painPoint: 'roi' }, isDuplicate: false },
    { name: 'Selvam Nadar', phone: '9876543013', email: 'selvam.n13@yahoo.co.in', city: 'Madurai', stage: 'QUALIFIED', sourceType: 'JUSTDIAL', sourceId: justdialSource.id, aiScore: 92, campaignName: null, adName: null, createdAt: daysAgo(1), ownerUserId: null, language: 'ta', factSheet: { roofType: 'sheet', monthlyBill: '₹3,000', budgetRange: '₹1.5-2L', urgency: 'this_week', decisionMaker: 'self', painPoint: 'power_cuts' }, isDuplicate: false },
    { name: 'Padma Nair', phone: '9876543014', email: 'padma.nair14@gmail.com', city: 'Kochi', stage: 'QUALIFIED', sourceType: 'META', sourceId: metaSource.id, aiScore: 76, campaignName: 'SolarSubsidy_Mar2026', adName: 'KWhToRs_Calculator', createdAt: daysAgo(4), ownerUserId: adminUserId, language: 'en', factSheet: { roofType: 'concrete', monthlyBill: '₹5,500', budgetRange: '₹2.5-3.5L', urgency: 'this_month', decisionMaker: 'spouse', painPoint: 'subsidy' }, isDuplicate: false },
    { name: 'Vijay Reddy', phone: '9876543015', email: null, city: 'Hyderabad', stage: 'QUALIFIED', sourceType: 'META', sourceId: metaSource.id, aiScore: 88, campaignName: 'PMSuryaGhar_Lead', adName: '3kW_Subsidy_Video', createdAt: daysAgo(2), ownerUserId: null, language: 'en', factSheet: { roofType: 'concrete', monthlyBill: '₹7,000', budgetRange: '₹3-5L', urgency: 'this_month', decisionMaker: 'self', painPoint: 'high_bill' }, isDuplicate: false },

    // ── FOLLOW_UP leads ──
    { name: 'Rekha Chettiar', phone: '9876543016', email: null, city: 'Coimbatore', stage: 'FOLLOW_UP', sourceType: 'INDIAMART', sourceId: indiamartSource.id, aiScore: 64, campaignName: null, adName: null, createdAt: daysAgo(7), ownerUserId: adminUserId, language: 'ta', factSheet: { roofType: 'concrete', monthlyBill: '₹2,500', budgetRange: '₹1-2L', urgency: 'exploring', decisionMaker: 'parent', painPoint: 'environment' }, isDuplicate: false },
    { name: 'Balamurugan Pillai', phone: '9876543017', email: 'bala.pillai17@rediffmail.com', city: 'Tiruppur', stage: 'FOLLOW_UP', sourceType: 'META', sourceId: metaSource.id, aiScore: 71, campaignName: 'RooftopSolar_Coimbatore', adName: 'SolarSavings_Reel', createdAt: daysAgo(5), ownerUserId: adminUserId, language: 'ta', factSheet: { roofType: 'tiled', monthlyBill: '₹3,500', budgetRange: '₹1.5-2.5L', urgency: 'this_quarter', decisionMaker: 'self', painPoint: 'roi' }, isDuplicate: false },
    { name: 'Saranya Rajan', phone: '9876543018', email: null, city: 'Salem', stage: 'FOLLOW_UP', sourceType: 'JUSTDIAL', sourceId: justdialSource.id, aiScore: 83, campaignName: null, adName: null, createdAt: daysAgo(6), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Dinesh Singh', phone: '9876543019', email: 'dinesh.singh19@gmail.com', city: 'Pune', stage: 'FOLLOW_UP', sourceType: 'META', sourceId: metaSource.id, aiScore: 69, campaignName: 'SolarLead_Q2', adName: 'FreeSiteVisit_Offer', createdAt: daysAgo(8), ownerUserId: adminUserId, language: 'en', factSheet: { roofType: 'concrete', monthlyBill: '₹4,000', budgetRange: '₹2-3L', urgency: 'this_quarter', decisionMaker: 'business_partner', painPoint: 'roi' }, isDuplicate: false },
    { name: 'Geetha Menon', phone: '9876543020', email: null, city: 'Kochi', stage: 'FOLLOW_UP', sourceType: 'WHATSAPP', sourceId: null, aiScore: 77, campaignName: null, adName: null, createdAt: daysAgo(10), ownerUserId: adminUserId, language: 'en', factSheet: null, isDuplicate: false },

    // ── CONVERTED leads ──
    { name: 'Manoj Patel', phone: '9876543021', email: 'manoj.patel21@gmail.com', city: 'Coimbatore', stage: 'CONVERTED', sourceType: 'META', sourceId: metaSource.id, aiScore: 95, campaignName: 'Solar_Rooftop_Q1_2026', adName: '5kW_ROI_Carousel', createdAt: daysAgo(20), ownerUserId: adminUserId, language: 'en', factSheet: { roofType: 'concrete', monthlyBill: '₹8,000', budgetRange: '₹4-6L', urgency: 'this_week', decisionMaker: 'self', painPoint: 'high_bill' }, isDuplicate: false },
    { name: 'Usha Krishnan', phone: '9876543022', email: null, city: 'Chennai', stage: 'CONVERTED', sourceType: 'JUSTDIAL', sourceId: justdialSource.id, aiScore: 87, campaignName: null, adName: null, createdAt: daysAgo(15), ownerUserId: adminUserId, language: 'ta', factSheet: { roofType: 'concrete', monthlyBill: '₹5,000', budgetRange: '₹2-3L', urgency: 'this_month', decisionMaker: 'self', painPoint: 'subsidy' }, isDuplicate: false },
    { name: 'Prakash Gopal', phone: '9876543023', email: 'prakash.g23@outlook.com', city: 'Erode', stage: 'CONVERTED', sourceType: 'INDIAMART', sourceId: indiamartSource.id, aiScore: 90, campaignName: null, adName: null, createdAt: daysAgo(25), ownerUserId: adminUserId, language: 'ta-en', factSheet: { roofType: 'sheet', monthlyBill: '₹4,200', budgetRange: '₹1.5-2.5L', urgency: 'this_week', decisionMaker: 'self', painPoint: 'power_cuts' }, isDuplicate: false },
    { name: 'Nirmala Venkatesh', phone: '9876543024', email: null, city: 'Coimbatore', stage: 'CONVERTED', sourceType: 'META', sourceId: metaSource.id, aiScore: 94, campaignName: 'SolarSubsidy_Mar2026', adName: '3kW_Subsidy_Video', createdAt: daysAgo(18), ownerUserId: adminUserId, language: 'ta', factSheet: { roofType: 'concrete', monthlyBill: '₹3,800', budgetRange: '₹1.5-2L', urgency: 'this_month', decisionMaker: 'self', painPoint: 'environment' }, isDuplicate: false },
    { name: 'Srinivasan Iyer', phone: '9876543025', email: 'srini.iyer25@gmail.com', city: 'Trichy', stage: 'CONVERTED', sourceType: 'MANUAL', sourceId: null, aiScore: 89, campaignName: null, adName: null, createdAt: daysAgo(30), ownerUserId: adminUserId, language: 'ta', factSheet: { roofType: 'concrete', monthlyBill: '₹6,500', budgetRange: '₹3-4L', urgency: 'this_month', decisionMaker: 'self', painPoint: 'high_bill' }, isDuplicate: false },

    // ── NOT_ANSWERED leads ──
    { name: 'Sumathi Murugan', phone: '9876543026', email: null, city: 'Madurai', stage: 'NOT_ANSWERED', sourceType: 'JUSTDIAL', sourceId: justdialSource.id, aiScore: 58, campaignName: null, adName: null, createdAt: daysAgo(4), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Ramesh Natarajan', phone: '9876543027', email: 'ramesh.n27@gmail.com', city: 'Salem', stage: 'NOT_ANSWERED', sourceType: 'META', sourceId: metaSource.id, aiScore: 62, campaignName: 'RooftopSolar_Coimbatore', adName: null, createdAt: daysAgo(3), ownerUserId: null, language: 'ta-en', factSheet: null, isDuplicate: false },
    { name: 'Malathi Chettiar', phone: '9876543028', email: null, city: 'Tiruppur', stage: 'NOT_ANSWERED', sourceType: 'INDIAMART', sourceId: indiamartSource.id, aiScore: 55, campaignName: null, adName: null, createdAt: daysAgo(5), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Ganesh Patel', phone: '9876543029', email: null, city: 'Bangalore', stage: 'NOT_ANSWERED', sourceType: 'META', sourceId: metaSource.id, aiScore: 70, campaignName: 'PMSuryaGhar_Lead', adName: 'KWhToRs_Calculator', createdAt: daysAgo(2), ownerUserId: null, language: 'en', factSheet: null, isDuplicate: false },
    { name: 'Vimala Pillai', phone: '9876543030', email: null, city: 'Coimbatore', stage: 'NOT_ANSWERED', sourceType: 'WEBSITE', sourceId: null, aiScore: null, campaignName: null, adName: null, createdAt: daysAgo(6), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },

    // ── INVALID leads ──
    { name: 'Subramaniam Kumar', phone: '9876543031', email: null, city: 'Coimbatore', stage: 'INVALID', sourceType: 'JUSTDIAL', sourceId: justdialSource.id, aiScore: 22, campaignName: null, adName: null, createdAt: daysAgo(8), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Revathi Singh', phone: '9876543032', email: null, city: 'Chennai', stage: 'INVALID', sourceType: 'META', sourceId: metaSource.id, aiScore: 18, campaignName: 'SolarLead_Q2', adName: null, createdAt: daysAgo(10), ownerUserId: null, language: 'en', factSheet: null, isDuplicate: false },
    { name: 'Chandran Rajan', phone: '9876543033', email: null, city: 'Salem', stage: 'INVALID', sourceType: 'INDIAMART', sourceId: indiamartSource.id, aiScore: 31, campaignName: null, adName: null, createdAt: daysAgo(12), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },

    // ── WRONG_ENQUIRY leads ──
    { name: 'Mythili Venkataraman', phone: '9876543034', email: null, city: 'Erode', stage: 'WRONG_ENQUIRY', sourceType: 'JUSTDIAL', sourceId: justdialSource.id, aiScore: 15, campaignName: null, adName: null, createdAt: daysAgo(9), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Muthukumar Nadar', phone: '9876543035', email: null, city: 'Trichy', stage: 'WRONG_ENQUIRY', sourceType: 'META', sourceId: metaSource.id, aiScore: 12, campaignName: 'SubsidySolar2026', adName: null, createdAt: daysAgo(11), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },

    // ── More NEW leads (fresh pipeline) ──
    { name: 'Prabhu Iyer', phone: '9876543036', email: null, city: 'Vellore', stage: 'NEW', sourceType: 'META', sourceId: metaSource.id, aiScore: 80, campaignName: 'SolarSubsidy_Mar2026', adName: 'SolarSavings_Reel', createdAt: hoursAgo(0.5), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Kala Gounder', phone: '9876543037', email: 'kala.g37@gmail.com', city: 'Coimbatore', stage: 'NEW', sourceType: 'INDIAMART', sourceId: indiamartSource.id, aiScore: 73, campaignName: null, adName: null, createdAt: hoursAgo(1.5), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Ravi Menon', phone: '9876543038', email: null, city: 'Kochi', stage: 'NEW', sourceType: 'META', sourceId: metaSource.id, aiScore: 86, campaignName: 'PMSuryaGhar_Lead', adName: '3kW_Subsidy_Video', createdAt: hoursAgo(2.5), ownerUserId: null, language: 'en', factSheet: null, isDuplicate: false },
    { name: 'Vasantha Krishnan', phone: '9876543039', email: null, city: 'Madurai', stage: 'NEW', sourceType: 'JUSTDIAL', sourceId: justdialSource.id, aiScore: 59, campaignName: null, adName: null, createdAt: hoursAgo(3.5), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Mohan Reddy', phone: '9876543040', email: 'mohan.r40@outlook.com', city: 'Hyderabad', stage: 'NEW', sourceType: 'WEBSITE', sourceId: null, aiScore: null, campaignName: null, adName: null, createdAt: hoursAgo(4.5), ownerUserId: null, language: 'en', factSheet: null, isDuplicate: false },
    { name: 'Hema Murugesan', phone: '9876543041', email: null, city: 'Tiruppur', stage: 'NEW', sourceType: 'META', sourceId: metaSource.id, aiScore: 76, campaignName: 'RooftopSolar_Coimbatore', adName: 'FreeSiteVisit_Offer', createdAt: hoursAgo(5.5), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Arun Subramanian', phone: '9876543042', email: null, city: 'Erode', stage: 'NEW', sourceType: 'INDIAMART', sourceId: indiamartSource.id, aiScore: 68, campaignName: null, adName: null, createdAt: hoursAgo(6.5), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Bharathi Nair', phone: '9876543043', email: 'bharathi.n43@gmail.com', city: 'Bangalore', stage: 'NEW', sourceType: 'MANUAL', sourceId: null, aiScore: null, campaignName: null, adName: null, createdAt: hoursAgo(7.5), ownerUserId: null, language: 'en', factSheet: null, isDuplicate: false },
    { name: 'Sundar Gopal', phone: '9876543044', email: null, city: 'Salem', stage: 'NEW', sourceType: 'WHATSAPP', sourceId: null, aiScore: 72, campaignName: null, adName: null, createdAt: hoursAgo(8.5), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Jayalakshmi Pillai', phone: '9876543045', email: null, city: 'Coimbatore', stage: 'NEW', sourceType: 'META', sourceId: metaSource.id, aiScore: 93, campaignName: 'Solar_Rooftop_Q1_2026', adName: '5kW_ROI_Carousel', createdAt: hoursAgo(9.5), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },

    // ── More qualified / follow-up ──
    { name: 'Venkatesh Natarajan', phone: '9876543046', email: 'venkat.n46@gmail.com', city: 'Trichy', stage: 'QUALIFIED', sourceType: 'META', sourceId: metaSource.id, aiScore: 81, campaignName: 'SubsidySolar2026', adName: 'SolarSavings_Reel', createdAt: daysAgo(3), ownerUserId: adminUserId, language: 'ta', factSheet: { roofType: 'concrete', monthlyBill: '₹4,800', budgetRange: '₹2-3L', urgency: 'this_month', decisionMaker: 'self', painPoint: 'high_bill' }, isDuplicate: false },
    { name: 'Janaki Sharma', phone: '9876543047', email: null, city: 'Pune', stage: 'QUALIFIED', sourceType: 'INDIAMART', sourceId: indiamartSource.id, aiScore: 75, campaignName: null, adName: null, createdAt: daysAgo(5), ownerUserId: null, language: 'en', factSheet: { roofType: 'concrete', monthlyBill: '₹5,200', budgetRange: '₹2.5-3.5L', urgency: 'this_quarter', decisionMaker: 'self', painPoint: 'roi' }, isDuplicate: false },
    { name: 'Shanthi Murugan', phone: '9876543048', email: null, city: 'Coimbatore', stage: 'FOLLOW_UP', sourceType: 'JUSTDIAL', sourceId: justdialSource.id, aiScore: 66, campaignName: null, adName: null, createdAt: daysAgo(12), ownerUserId: adminUserId, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Indira Rajan', phone: '9876543049', email: 'indira.r49@yahoo.co.in', city: 'Chennai', stage: 'FOLLOW_UP', sourceType: 'META', sourceId: metaSource.id, aiScore: 84, campaignName: 'SolarLead_Q2', adName: 'KWhToRs_Calculator', createdAt: daysAgo(9), ownerUserId: adminUserId, language: 'ta-en', factSheet: { roofType: 'concrete', monthlyBill: '₹5,500', budgetRange: '₹2.5-3L', urgency: 'this_month', decisionMaker: 'self', painPoint: 'subsidy' }, isDuplicate: false },
    { name: 'Muthukumar Krishnan', phone: '9876543050', email: null, city: 'Madurai', stage: 'NOT_ANSWERED', sourceType: 'INDIAMART', sourceId: indiamartSource.id, aiScore: 60, campaignName: null, adName: null, createdAt: daysAgo(7), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Priya Venkatesh', phone: '9876543051', email: null, city: 'Erode', stage: 'NOT_ANSWERED', sourceType: 'JUSTDIAL', sourceId: justdialSource.id, aiScore: 53, campaignName: null, adName: null, createdAt: daysAgo(4), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Rajan Pillai', phone: '9876543052', email: 'rajan.p52@gmail.com', city: 'Vellore', stage: 'CONVERTED', sourceType: 'META', sourceId: metaSource.id, aiScore: 96, campaignName: 'PMSuryaGhar_Lead', adName: '5kW_ROI_Carousel', createdAt: daysAgo(22), ownerUserId: adminUserId, language: 'ta', factSheet: { roofType: 'concrete', monthlyBill: '₹7,200', budgetRange: '₹3-5L', urgency: 'this_week', decisionMaker: 'self', painPoint: 'high_bill' }, isDuplicate: false },
    { name: 'Kamala Gounder', phone: '9876543053', email: null, city: 'Tiruppur', stage: 'CONVERTED', sourceType: 'INDIAMART', sourceId: indiamartSource.id, aiScore: 89, campaignName: null, adName: null, createdAt: daysAgo(28), ownerUserId: adminUserId, language: 'ta', factSheet: { roofType: 'sheet', monthlyBill: '₹3,200', budgetRange: '₹1.5-2L', urgency: 'this_month', decisionMaker: 'self', painPoint: 'power_cuts' }, isDuplicate: false },
    { name: 'Siva Murugesan', phone: '9876543054', email: null, city: 'Salem', stage: 'INVALID', sourceType: 'META', sourceId: metaSource.id, aiScore: 9, campaignName: 'SolarSubsidy_Mar2026', adName: null, createdAt: daysAgo(14), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Vijayalakshmi Iyer', phone: '9876543055', email: 'vijaya.i55@gmail.com', city: 'Coimbatore', stage: 'NEW', sourceType: 'META', sourceId: metaSource.id, aiScore: 87, campaignName: 'Solar_Rooftop_Q1_2026', adName: 'FreeSiteVisit_Offer', createdAt: hoursAgo(13), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Bhaskar Singh', phone: '9876543056', email: null, city: 'Hyderabad', stage: 'QUALIFIED', sourceType: 'WEBSITE', sourceId: null, aiScore: null, campaignName: null, adName: null, createdAt: daysAgo(6), ownerUserId: adminUserId, language: 'en', factSheet: { roofType: 'concrete', monthlyBill: '₹9,000', budgetRange: '₹4-6L', urgency: 'this_quarter', decisionMaker: 'self', painPoint: 'high_bill' }, isDuplicate: false },
    { name: 'Lalitha Krishnan', phone: '9876543057', email: null, city: 'Chennai', stage: 'FOLLOW_UP', sourceType: 'WHATSAPP', sourceId: null, aiScore: 70, campaignName: null, adName: null, createdAt: daysAgo(14), ownerUserId: adminUserId, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Sundaresan Rajan', phone: '9876543058', email: 'sundar.r58@outlook.com', city: 'Trichy', stage: 'NEW', sourceType: 'META', sourceId: metaSource.id, aiScore: 78, campaignName: 'SubsidySolar2026', adName: '3kW_Subsidy_Video', createdAt: hoursAgo(14), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Meenakshi Gounder', phone: '9876543059', email: null, city: 'Erode', stage: 'NOT_ANSWERED', sourceType: 'JUSTDIAL', sourceId: justdialSource.id, aiScore: 61, campaignName: null, adName: null, createdAt: daysAgo(3), ownerUserId: null, language: 'ta', factSheet: null, isDuplicate: false },
    { name: 'Anand Venkataraman', phone: '9876543060', email: 'anand.v60@gmail.com', city: 'Bangalore', stage: 'CONVERTED', sourceType: 'META', sourceId: metaSource.id, aiScore: 93, campaignName: 'Solar_Rooftop_Q1_2026', adName: '5kW_ROI_Carousel', createdAt: daysAgo(35), ownerUserId: adminUserId, language: 'en', factSheet: { roofType: 'concrete', monthlyBill: '₹10,000', budgetRange: '₹5-8L', urgency: 'this_week', decisionMaker: 'self', painPoint: 'roi' }, isDuplicate: false },
  ];

  // 3. Upsert all leads
  const createdLeads: { id: string; name: string; stage: string; phone: string }[] = [];

  for (const def of leadDefs) {
    const phoneNorm = def.phone.startsWith('+91') ? def.phone : `+91${def.phone}`;

    // Check if lead already exists
    const existing = await prisma.lead.findFirst({
      where: { tenantId: HQ_TENANT_ID, phone: phoneNorm },
    });

    if (existing) {
      createdLeads.push({ id: existing.id, name: def.name, stage: def.stage, phone: phoneNorm });
      continue;
    }

    const stageChangedAt = def.stage === 'NEW' ? def.createdAt : daysAgo(Math.floor(Math.random() * 5));
    const firstContactedAt = def.stage !== 'NEW' && def.stage !== 'NOT_ANSWERED' ? new Date(def.createdAt.getTime() + 3600000) : null;

    const lead = await prisma.lead.create({
      data: {
        tenantId: HQ_TENANT_ID,
        name: def.name,
        phone: phoneNorm,
        phoneRaw: def.phone,
        email: def.email,
        city: def.city,
        pincode: PINCODES[def.city] ?? null,
        stage: def.stage,
        stageChangedAt,
        sourceType: def.sourceType,
        sourceId: def.sourceId,
        campaignName: def.campaignName,
        adName: def.adName,
        aiScore: def.aiScore,
        ownerUserId: def.ownerUserId,
        language: def.language,
        factSheet: def.factSheet as never,
        isDuplicate: def.isDuplicate,
        firstContactedAt,
        receivedAt: def.createdAt,
        createdAt: def.createdAt,
        rawPayload: { seed: true } as never,
      },
    });

    createdLeads.push({ id: lead.id, name: def.name, stage: def.stage, phone: phoneNorm });
  }

  // 4. Add activities for non-NEW leads
  const activityLeads = createdLeads.filter((l) => !['NEW', 'INVALID', 'WRONG_ENQUIRY'].includes(l.stage));

  for (const lead of activityLeads) {
    const existingActivities = await prisma.leadActivity.count({ where: { leadId: lead.id } });
    if (existingActivities > 0) continue;

    const activities: {
      type: 'CALL' | 'NOTE' | 'STAGE_CHANGE' | 'ASSIGNMENT';
      actorIsAi: boolean;
      payload: object;
      createdAt: Date;
    }[] = [];

    // AI verification call
    activities.push({
      type: 'CALL',
      actorIsAi: true,
      payload: { persona: 'RESHMA_VERIFY', status: 'COMPLETED', direction: 'OUTBOUND', durationSec: randomItem([45, 62, 88, 120, 145, 180]) },
      createdAt: hoursAgo(randomItem([1, 2, 4, 8, 12, 24, 48])),
    });

    // Stage change from NEW → current
    activities.push({
      type: 'STAGE_CHANGE',
      actorIsAi: true,
      payload: { newStage: lead.stage, previousStage: 'NEW', reason: 'AI verified interest' },
      createdAt: hoursAgo(randomItem([2, 6, 12, 24, 36])),
    });

    // Notes for qualified/follow-up/converted
    if (['QUALIFIED', 'FOLLOW_UP', 'CONVERTED'].includes(lead.stage)) {
      const notes = [
        'Customer is interested in 3kW system for home. Monthly bill around ₹4,500. Has terrace space.',
        'Spoke to customer — wants to reduce electricity bill. Budget flexible. Prefers EMI option.',
        'Customer asked about PM Surya Ghar subsidy. Explained eligibility criteria. Very interested.',
        'Follow-up scheduled. Customer needs to discuss with spouse. Will confirm by next week.',
        'Site visit booked. RCC roof, south-facing. Good solar potential.',
        'Customer compared with another vendor. Our quote is competitive. Likely to convert.',
        'Wants detailed ROI calculation. Sent WhatsApp brochure. Waiting for reply.',
      ];

      activities.push({
        type: 'NOTE',
        actorIsAi: false,
        payload: { note: randomItem(notes) },
        createdAt: hoursAgo(randomItem([1, 3, 6, 12, 24])),
      });

      if (lead.stage === 'CONVERTED') {
        activities.push({
          type: 'STAGE_CHANGE',
          actorIsAi: false,
          payload: { newStage: 'CONVERTED', previousStage: 'QUALIFIED', reason: 'Deal closed — installation confirmed' },
          createdAt: hoursAgo(randomItem([24, 48, 72, 120])),
        });
        activities.push({
          type: 'NOTE',
          actorIsAi: false,
          payload: { note: 'Installation confirmed. Advance payment received. Site survey completed. System: 5kW On-Grid with net-metering.' },
          createdAt: hoursAgo(randomItem([12, 24, 48])),
        });
      }
    }

    // Bulk insert activities
    await prisma.leadActivity.createMany({
      data: activities.map((a) => ({
        tenantId: HQ_TENANT_ID,
        leadId: lead.id,
        type: a.type,
        actorIsAi: a.actorIsAi,
        actorUserId: a.actorIsAi ? null : adminUserId,
        payload: a.payload as never,
        createdAt: a.createdAt,
      })),
      skipDuplicates: true,
    });
  }

  // 5. Create some call records for CONVERTED and QUALIFIED leads
  const callLeads = createdLeads.filter((l) => ['CONVERTED', 'QUALIFIED'].includes(l.stage));

  for (const lead of callLeads) {
    const existingCalls = await prisma.call.count({ where: { leadId: lead.id } });
    if (existingCalls > 0) continue;

    await prisma.call.create({
      data: {
        tenantId: HQ_TENANT_ID,
        leadId: lead.id,
        persona: 'RESHMA_VERIFY',
        direction: 'OUTBOUND',
        fromNumber: '+918800001234',
        toNumber: lead.phone,
        initiatedAt: hoursAgo(randomItem([24, 48, 72, 96])),
        connectedAt: hoursAgo(randomItem([24, 48, 72, 96])),
        endedAt: hoursAgo(randomItem([24, 48, 72, 96])),
        durationSec: randomItem([45, 62, 88, 120, 145, 180, 210]),
        status: 'COMPLETED',
        endReason: 'completed',
        transcript: {
          summary: 'Customer confirmed interest in solar installation. Discussed system size and subsidy options.',
          keyPoints: ['Interested in 3-5kW system', 'Aware of PM Surya Ghar subsidy', 'Budget: ₹2-4L'],
        } as never,
        llmAnalysis: {
          intent: 'INTERESTED',
          sentimentScore: randomItem([7, 8, 9]),
          nextAction: lead.stage === 'CONVERTED' ? 'CLOSE_DEAL' : 'SCHEDULE_VISIT',
          keyInsights: ['Motivated buyer', 'Has roof space', 'Financially capable'],
        } as never,
      },
    });

    if (lead.stage === 'QUALIFIED') {
      await prisma.call.create({
        data: {
          tenantId: HQ_TENANT_ID,
          leadId: lead.id,
          persona: 'KARTHIK_SALES',
          direction: 'OUTBOUND',
          fromNumber: '+918800005678',
          toNumber: lead.phone,
          initiatedAt: hoursAgo(randomItem([12, 24, 36])),
          connectedAt: hoursAgo(randomItem([12, 24, 36])),
          endedAt: hoursAgo(randomItem([12, 24, 36])),
          durationSec: randomItem([180, 240, 300, 360, 420]),
          status: 'COMPLETED',
          endReason: 'completed',
        },
      });
    }
  }

  // Summary
  const totalLeads = await prisma.lead.count({ where: { tenantId: HQ_TENANT_ID } });
  const byStage = await prisma.lead.groupBy({
    by: ['stage'],
    where: { tenantId: HQ_TENANT_ID },
    _count: true,
  });

  process.stdout.write(`\n✓ Leads seed complete\n`);
  process.stdout.write(`  Total leads: ${totalLeads}\n`);
  byStage.forEach((s) => process.stdout.write(`  ${s.stage}: ${s._count}\n`));
}

main()
  .catch((err: unknown) => {
    process.stderr.write(`Seed failed: ${String(err)}\n`);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
