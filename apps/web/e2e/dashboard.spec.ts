import { test, expect, mockApiAs, ADMIN_USER } from './fixtures';

test.describe('Dashboard — ADMIN role', () => {
  test('loads dashboard and shows user name in sidebar', async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    await expect(asAdmin.getByText('Excess Admin')).toBeVisible({ timeout: 10_000 });
    await expect(asAdmin.getByText('HQ Administrator')).toBeVisible();
  });

  test('shows all navigation groups for admin', async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    await expect(asAdmin.getByText('Sales')).toBeVisible({ timeout: 8_000 });
    await expect(asAdmin.getByText('Delivery')).toBeVisible();
    // exact: true avoids matching "AI Voice Agent" h2 on the dashboard page
    await expect(asAdmin.getByText('Voice Agent', { exact: true })).toBeVisible();
    // exact: true avoids matching "Franchise Network" h2 on the dashboard page
    await expect(asAdmin.getByText('Franchise', { exact: true })).toBeVisible();
    await expect(asAdmin.getByText('Analytics')).toBeVisible();
  });

  test('shows KPI stat cards with data', async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    // exact: true avoids matching "142 total leads" subtitle text
    await expect(asAdmin.getByText('142', { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(asAdmin.getByText('8', { exact: true })).toBeVisible();
    await expect(asAdmin.getByText('23', { exact: true })).toBeVisible();
  });

  test('shows welcome banner with user name', async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    await expect(asAdmin.getByText(/Welcome back, Excess/)).toBeVisible({ timeout: 8_000 });
  });

  test('pipeline funnel section renders', async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    await expect(asAdmin.getByText('Pipeline Funnel')).toBeVisible({ timeout: 8_000 });
  });

  test("today's appointments section renders", async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    await expect(asAdmin.getByText("Today's Schedule")).toBeVisible({ timeout: 8_000 });
  });

  test('franchise network section visible for admin', async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    // Use h2 heading selector — avoids matching nav label "Franchise"
    await expect(asAdmin.locator('h2', { hasText: 'Franchise Network' })).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Dashboard — EMPLOYEE role', () => {
  test('loads dashboard and shows employee name', async ({ asEmployee }) => {
    await asEmployee.goto('/dashboard');
    await expect(asEmployee.getByText('Test Employee')).toBeVisible({ timeout: 10_000 });
    // exact: true prevents matching "Test Employee" which also contains "Employee"
    await expect(asEmployee.getByText('Employee', { exact: true })).toBeVisible();
  });

  test('shows Sales and Delivery nav groups but not Voice Agent or Franchise', async ({ asEmployee }) => {
    await asEmployee.goto('/dashboard');
    await expect(asEmployee.getByText('Sales')).toBeVisible({ timeout: 8_000 });
    await expect(asEmployee.getByText('Delivery')).toBeVisible();
    // exact: true avoids matching "AI Voice Agent" h2 in page content
    await expect(asEmployee.getByText('Voice Agent', { exact: true })).not.toBeVisible();
    // Use nav context to avoid matching page content with the word "Franchise"
    await expect(asEmployee.locator('nav').getByText('Franchise')).not.toBeVisible();
  });

  test('shows KPI stats', async ({ asEmployee }) => {
    await asEmployee.goto('/dashboard');
    await expect(asEmployee.getByText('142', { exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test('franchise snapshot h2 heading is absent for employee', async ({ asEmployee }) => {
    await asEmployee.goto('/dashboard');
    await asEmployee.waitForTimeout(2_000);
    // The FranchiseSnapshot component returns null for non-ADMIN
    await expect(asEmployee.locator('h2', { hasText: 'Franchise Network' })).not.toBeVisible();
  });
});

test.describe('Dashboard — error handling', () => {
  test('handles stats API error gracefully without crashing', async ({ page }) => {
    // Use full mockApiAs for proper mocks, then override /leads/stats with 500.
    // This avoids crashing other components (notifications, funnel, etc.).
    await mockApiAs(page, ADMIN_USER);
    // Registered AFTER mockApiAs so LIFO gives it higher priority over /leads/stats mock inside
    await page.route('**/api/v1/leads/stats', (r) =>
      r.fulfill({ status: 500, json: { error: { code: 'server_error' } } }),
    );
    await page.goto('/dashboard');
    // Shell still renders — user name visible in sidebar even when stats endpoint errors
    await expect(page.getByText('Excess Admin')).toBeVisible({ timeout: 8_000 });
    // Stat cards show skeleton (no "Total Leads" label), not crash.
    // exact: true required — getByText is case-insensitive and would match "142 total leads"
    // in the funnel component's subtitle without it.
    await expect(page.getByText('Total Leads', { exact: true })).not.toBeVisible();
  });
});
