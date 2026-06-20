import { test, expect, LEADS_LIST } from './fixtures';

test.describe('Leads page — ADMIN', () => {
  test('navigates to leads page from sidebar', async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    await asAdmin.getByText('Sales').click();
    await asAdmin.getByRole('link', { name: 'Leads' }).first().click();
    await expect(asAdmin).toHaveURL('/leads', { timeout: 8_000 });
  });

  test('leads page renders without crash', async ({ asAdmin }) => {
    await asAdmin.goto('/leads');
    await expect(asAdmin.getByRole('heading', { name: 'Leads' }).first()).toBeVisible({ timeout: 8_000 });
  });

  test('shows lead names from API response', async ({ asAdmin }) => {
    await asAdmin.goto('/leads');
    await expect(asAdmin.getByText('Ravi Kumar')).toBeVisible({ timeout: 8_000 });
    await expect(asAdmin.getByText('Priya Sharma')).toBeVisible();
  });

  test('shows lead source badges', async ({ asAdmin }) => {
    await asAdmin.goto('/leads');
    // SOURCE_LABELS maps META → 'Meta', JUSTDIAL → 'JustDial'.
    // Each row renders the source twice: a mobile-only span (md:hidden, earlier in
    // DOM) and the desktop column (later in DOM). At the desktop test viewport the
    // desktop one is the visible match, so assert .last().
    await expect(asAdmin.locator('span', { hasText: /^Meta$/ }).last()).toBeVisible({ timeout: 8_000 });
    await expect(asAdmin.locator('span', { hasText: /^JustDial$/ }).last()).toBeVisible();
  });

  test('shows empty state when no leads', async ({ page }) => {
    await page.context().addCookies([
      { name: 'excess_session', value: 'test', domain: 'localhost', path: '/' },
      { name: 'excess_role', value: 'ADMIN', domain: 'localhost', path: '/' },
    ]);
    await page.route('**/api/v1/**', (r) =>
      r.fulfill({ json: { data: [], meta: { unreadCount: 0, total: 0 } } }),
    );
    await page.route('**/api/v1/auth/me', (r) =>
      r.fulfill({
        json: {
          data: {
            id: '1', name: 'Admin', email: 'a@b.com', role: 'ADMIN',
            tenantId: 't1', teamId: null,
            tenant: { id: 't1', name: 'HQ', type: 'HQ', status: 'ACTIVE' },
          },
        },
      }),
    );
    await page.route('**/api/v1/leads**', (r) =>
      r.fulfill({ json: { data: [], meta: { total: 0, nextCursor: null } } }),
    );
    await page.goto('/leads');
    // leads-table.tsx empty state: "No leads found. Adjust filters or add a lead manually."
    await expect(page.getByText(/No leads found/)).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Leads page — EMPLOYEE', () => {
  test('employee can access leads page', async ({ asEmployee }) => {
    await asEmployee.goto('/leads');
    await expect(asEmployee.getByRole('heading', { name: 'Leads' }).first()).toBeVisible({ timeout: 8_000 });
  });

  test('employee sees their leads', async ({ asEmployee }) => {
    await asEmployee.goto('/leads');
    await expect(asEmployee.getByText('Ravi Kumar')).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Lead detail page', () => {
  test('navigates to lead detail on row click', async ({ asAdmin }) => {
    await asAdmin.route('**/api/v1/leads/lead-1**', (r) =>
      r.fulfill({
        json: {
          data: {
            ...LEADS_LIST.data.leads[0],
            notes: [],
            calls: [],
            appointments: [],
            quotations: [],
          },
        },
      }),
    );
    await asAdmin.goto('/leads');
    await asAdmin.getByText('Ravi Kumar').click();
    await expect(asAdmin).toHaveURL('/leads/lead-1', { timeout: 8_000 });
  });
});
