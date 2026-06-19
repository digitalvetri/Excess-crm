import { test, expect } from './fixtures';

test.describe('Navigation — ADMIN', () => {
  test('Dashboard link is active on /dashboard', async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    const dashLink = asAdmin.getByRole('link', { name: 'Dashboard' });
    await expect(dashLink).toBeVisible({ timeout: 8_000 });
  });

  test('can navigate to Appointments', async ({ asAdmin }) => {
    await asAdmin.route('**/api/v1/appointments**', (r) =>
      r.fulfill({ json: { data: { appointments: [], nextCursor: null, hasMore: false } } }),
    );
    await asAdmin.goto('/dashboard');
    await asAdmin.getByText('Sales').click();
    await asAdmin.getByRole('link', { name: 'Appointments' }).click();
    await expect(asAdmin).toHaveURL('/appointments', { timeout: 8_000 });
  });

  test('can navigate to Reports', async ({ asAdmin }) => {
    await asAdmin.route('**/api/v1/reports/**', (r) =>
      r.fulfill({ json: { data: [] } }),
    );
    await asAdmin.goto('/dashboard');
    await asAdmin.getByText('Analytics').click();
    await asAdmin.getByRole('link', { name: 'Reports' }).click();
    await expect(asAdmin).toHaveURL('/reports', { timeout: 8_000 });
  });

  test('Knowledge Base link always visible', async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    await expect(asAdmin.getByRole('link', { name: 'Knowledge Base' })).toBeVisible({ timeout: 8_000 });
  });

  test('Settings group visible for admin', async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    await expect(asAdmin.getByText('Settings')).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Navigation — EMPLOYEE', () => {
  test('employee sees Sales group', async ({ asEmployee }) => {
    await asEmployee.goto('/dashboard');
    await expect(asEmployee.getByText('Sales')).toBeVisible({ timeout: 8_000 });
  });

  test('employee does not see Voice Agent group', async ({ asEmployee }) => {
    await asEmployee.goto('/dashboard');
    await asEmployee.waitForTimeout(2000);
    // exact: true avoids matching "AI Voice Agent" h2 that appears in dashboard page content
    await expect(asEmployee.getByText('Voice Agent', { exact: true })).not.toBeVisible();
  });

  test('employee does not see Franchise group', async ({ asEmployee }) => {
    await asEmployee.goto('/dashboard');
    await asEmployee.waitForTimeout(2000);
    await expect(asEmployee.getByText('Franchise')).not.toBeVisible();
  });

  test('employee does not see Settings group', async ({ asEmployee }) => {
    await asEmployee.goto('/dashboard');
    await asEmployee.waitForTimeout(2000);
    await expect(asEmployee.getByText('Settings')).not.toBeVisible();
  });

  test('employee can navigate to Calls', async ({ asEmployee }) => {
    await asEmployee.goto('/dashboard');
    await asEmployee.getByText('Sales').click();
    await asEmployee.getByRole('link', { name: 'Calls' }).click();
    await expect(asEmployee).toHaveURL('/calls', { timeout: 8_000 });
  });
});

test.describe('Mobile navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('hamburger menu opens sidebar on mobile', async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    // Sidebar should be hidden on mobile initially
    const menuBtn = asAdmin.getByRole('button', { name: 'Open menu' });
    await expect(menuBtn).toBeVisible({ timeout: 8_000 });
    await menuBtn.click();
    // After click, sidebar should appear
    await expect(asAdmin.getByText('Excess Admin')).toBeVisible({ timeout: 3_000 });
  });
});
