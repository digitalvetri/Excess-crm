import { test as base, type Page } from '@playwright/test';

// ── Mock data ────────────────────────────────────────────────────────────────

export const ADMIN_USER = {
  id: 'user-admin-1',
  name: 'Excess Admin',
  email: 'admin@excessindia.com',
  role: 'ADMIN' as const,
  tenantId: 'tenant-1',
  teamId: null,
  tenant: { id: 'tenant-1', name: 'Excess Renew HQ', type: 'HQ', status: 'ACTIVE' },
};

export const EMPLOYEE_USER = {
  id: 'user-emp-1',
  name: 'Test Employee',
  email: 'employee@excessindia.com',
  role: 'EMPLOYEE' as const,
  tenantId: 'tenant-1',
  teamId: 'team-1',
  tenant: { id: 'tenant-1', name: 'Excess Renew HQ', type: 'HQ', status: 'ACTIVE' },
};

// NOTE: names are deliberately distinct from ROLE_LABELS (e.g. 'Franchise Owner')
// so getByText(user.name) in the sidebar doesn't collide with the role label below it.
export const FRANCHISE_OWNER_USER = {
  id: 'user-fo-1',
  name: 'Murugan Selvam',
  email: 'owner@franchise.com',
  role: 'FRANCHISE_OWNER' as const,
  tenantId: 'tenant-2',
  teamId: null,
  tenant: { id: 'tenant-2', name: 'Coimbatore Franchise', type: 'FRANCHISE', status: 'ACTIVE', tier: 'SILVER' },
};

export const FRANCHISE_USER_USER = {
  id: 'user-fu-1',
  name: 'Priya Devi',
  email: 'staff@franchise.com',
  role: 'FRANCHISE_USER' as const,
  tenantId: 'tenant-2',
  teamId: null,
  tenant: { id: 'tenant-2', name: 'Coimbatore Franchise', type: 'FRANCHISE', status: 'ACTIVE', tier: 'SILVER' },
};

export const ENGINEER_USER = {
  id: 'user-eng-1',
  name: 'Site Engineer',
  email: 'engineer@excessindia.com',
  role: 'ENGINEER' as const,
  tenantId: 'tenant-1',
  teamId: null,
  tenant: { id: 'tenant-1', name: 'Excess Renew HQ', type: 'HQ', status: 'ACTIVE', tier: 'HQ' },
};

export const DASHBOARD_STATS = {
  totalLeads: 142,
  newToday: 8,
  callsToday: 23,
  conversionRate: 14.7,
  converted: 21,
  newYesterday: 5,
  callsYesterday: 19,
};

export const PIPELINE_FUNNEL = {
  monthStart: new Date().toISOString(),
  stages: [
    { stage: 'NEW', count: 58 },
    { stage: 'QUALIFIED', count: 34 },
    { stage: 'FOLLOW_UP', count: 20 },
    { stage: 'CONVERTED', count: 21 },
    { stage: 'NOT_ANSWERED', count: 9 },
  ],
};

// Leads list — structure matches LeadsResponse: { data: { leads, nextCursor, hasMore } }
export const LEADS_LIST = {
  data: {
    leads: [
      {
        id: 'lead-1',
        name: 'Ravi Kumar',
        phone: '9876543210',
        email: 'ravi@example.com',
        city: 'Coimbatore',
        state: null,
        pincode: null,
        stage: 'NEW',
        sourceType: 'META',
        campaignName: null,
        adName: null,
        language: null,
        aiScore: null,
        aiScoreBreakdown: null,
        factSheet: null,
        tags: [],
        ownerUserId: null,
        teamId: null,
        createdAt: new Date().toISOString(),
        stageChangedAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        firstContactedAt: null,
        updatedAt: new Date().toISOString(),
        scheduledAt: null,
        isDuplicate: false,
        duplicateOfId: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        utmContent: null,
        utmTerm: null,
      },
      {
        id: 'lead-2',
        name: 'Priya Sharma',
        phone: '9876543211',
        email: 'priya@example.com',
        city: 'Chennai',
        state: null,
        pincode: null,
        stage: 'QUALIFIED',
        sourceType: 'JUSTDIAL',
        campaignName: null,
        adName: null,
        language: null,
        aiScore: null,
        aiScoreBreakdown: null,
        factSheet: null,
        tags: [],
        ownerUserId: 'user-emp-1',
        teamId: 'team-1',
        createdAt: new Date().toISOString(),
        stageChangedAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        firstContactedAt: null,
        updatedAt: new Date().toISOString(),
        scheduledAt: null,
        isDuplicate: false,
        duplicateOfId: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        utmContent: null,
        utmTerm: null,
      },
    ],
    nextCursor: null,
    hasMore: false,
  },
};

// Appointments — structure matches AppointmentsResponse: { data: { appointments, nextCursor, hasMore } }
export const APPOINTMENTS_LIST = {
  data: {
    appointments: [],
    nextCursor: null,
    hasMore: false,
  },
};

export const NOTIFICATIONS = { data: [], meta: { total: 0, unread: 0 } };

const FRANCHISE_SUMMARY = {
  total: 0,
  active: 0,
  onboarding: 0,
  suspended: 0,
  probation: 0,
  pendingCommissionCount: 0,
  pendingCommissionInr: '0',
};

const CALL_ANALYTICS = {
  totalCalls: 0,
  connectRate: 0,
  avgDurationSec: 0,
  byStatus: [],
  byPersona: [],
  daily: [],
  byHour: [],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

type KnownUser =
  | typeof ADMIN_USER
  | typeof EMPLOYEE_USER
  | typeof FRANCHISE_OWNER_USER
  | typeof FRANCHISE_USER_USER
  | typeof ENGINEER_USER;

export async function mockApiAs(page: Page, user: KnownUser) {
  // Set session cookies so Next.js middleware lets the request through.
  await page.context().addCookies([
    {
      name: 'excess_session',
      value: 'test-session-token',
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
    },
    {
      name: 'excess_role',
      value: user.role,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
    },
  ]);

  // Catch-all: unmocked /api/v1/* requests return empty data instead of
  // hitting the real Next.js Route Handler (which would try to reach Fastify).
  // Registered FIRST = LOWEST priority (LIFO stack).
  await page.route('**/api/v1/**', (r) =>
    r.fulfill({ json: { data: [], meta: { total: 0 } } }),
  );

  // Auth routes
  await page.route('**/api/v1/auth/me', (r) =>
    r.fulfill({ json: { data: user } }),
  );
  await page.route('**/api/v1/auth/login', async (route) => {
    await page.context().addCookies([
      { name: 'excess_session', value: 'test-session-token', domain: 'localhost', path: '/' },
      { name: 'excess_role', value: user.role, domain: 'localhost', path: '/' },
    ]);
    await route.fulfill({ json: { data: { user } } });
  });
  await page.route('**/api/v1/auth/logout', async (route) => {
    await page.context().clearCookies();
    await route.fulfill({ json: { data: {} } });
  });

  // Notifications
  await page.route('**/api/v1/notifications**', (r) =>
    r.fulfill({ json: NOTIFICATIONS }),
  );

  // Appointments — must return nested { appointments: [] } structure
  await page.route('**/api/v1/appointments**', (r) =>
    r.fulfill({ json: APPOINTMENTS_LIST }),
  );

  // Reports
  await page.route('**/api/v1/reports/funnel**', (r) =>
    r.fulfill({ json: { data: PIPELINE_FUNNEL } }),
  );
  await page.route('**/api/v1/reports/calls**', (r) =>
    r.fulfill({ json: { data: CALL_ANALYTICS } }),
  );
  await page.route('**/api/v1/reports/sources**', (r) =>
    r.fulfill({ json: { data: { sources: [] } } }),
  );
  await page.route('**/api/v1/reports/daily**', (r) =>
    r.fulfill({ json: { data: [] } }),
  );

  // Franchise
  await page.route('**/api/v1/franchise/summary**', (r) =>
    r.fulfill({ json: { data: FRANCHISE_SUMMARY } }),
  );

  // Leads — register general catch first, then more-specific routes after (LIFO priority)
  await page.route('**/api/v1/leads**', (r) =>
    r.fulfill({ json: LEADS_LIST }),
  );
  // /leads/views must be registered AFTER /leads** to win in LIFO
  await page.route('**/api/v1/leads/views**', (r) =>
    r.fulfill({ json: { data: [] } }),
  );
  // /leads/stats must be registered AFTER /leads** to win in LIFO
  await page.route('**/api/v1/leads/stats**', (r) =>
    r.fulfill({ json: { data: DASHBOARD_STATS } }),
  );
}

// ── Custom fixture ────────────────────────────────────────────────────────────

type Fixtures = {
  asAdmin: Page;
  asEmployee: Page;
  asFranchiseOwner: Page;
  asFranchiseUser: Page;
  asEngineer: Page;
};

export const test = base.extend<Fixtures>({
  asAdmin: async ({ page }, use) => {
    await mockApiAs(page, ADMIN_USER);
    await use(page);
  },
  asEmployee: async ({ page }, use) => {
    await mockApiAs(page, EMPLOYEE_USER);
    await use(page);
  },
  asFranchiseOwner: async ({ page }, use) => {
    await mockApiAs(page, FRANCHISE_OWNER_USER);
    await use(page);
  },
  asFranchiseUser: async ({ page }, use) => {
    await mockApiAs(page, FRANCHISE_USER_USER);
    await use(page);
  },
  asEngineer: async ({ page }, use) => {
    await mockApiAs(page, ENGINEER_USER);
    await use(page);
  },
});

export { expect } from '@playwright/test';
