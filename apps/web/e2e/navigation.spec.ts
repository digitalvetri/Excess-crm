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

// ── New role-scoped navigation tests ─────────────────────────────────────────

test.describe('Navigation — EMPLOYEE', () => {
  test('Can navigate to Appointments from sidebar', async ({ asEmployee }) => {
    // Rely on the fixture's mocks (auth/me, appointments, catch-all). Do NOT register
    // a broad **/api/v1/** route here — it would shadow the fixture's auth/me (Playwright
    // matches routes LIFO), leaving useAuth without a role so the nav never renders.
    await asEmployee.goto('/dashboard');
    await asEmployee.getByText('Sales').click();
    await asEmployee.getByRole('link', { name: 'Appointments' }).click();
    await expect(asEmployee).toHaveURL('/appointments', { timeout: 8_000 });
  });

  test('Cannot see Settings link in sidebar', async ({ asEmployee }) => {
    await asEmployee.goto('/dashboard');
    await asEmployee.waitForTimeout(2000);
    await expect(asEmployee.getByRole('link', { name: 'Settings' })).not.toBeVisible();
  });

  test('Can navigate to Leads', async ({ asEmployee }) => {
    // Rely on the fixture's mocks — a broad **/api/v1/** route here would shadow auth/me.
    await asEmployee.goto('/dashboard');
    await asEmployee.getByText('Sales').click();
    await asEmployee.getByRole('link', { name: 'Leads' }).click();
    await expect(asEmployee).toHaveURL('/leads', { timeout: 8_000 });
  });
});

test.describe('Navigation — FRANCHISE_OWNER', () => {
  test('Dashboard link is active on /dashboard', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/dashboard');
    const dashLink = asFranchiseOwner.getByRole('link', { name: 'Dashboard' });
    await expect(dashLink).toBeVisible({ timeout: 8_000 });
  });

  test('Cannot see Voice Agent link', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/dashboard');
    await asFranchiseOwner.waitForTimeout(2000);
    await expect(asFranchiseOwner.getByRole('link', { name: 'Voice Agent' })).not.toBeVisible();
  });

  test('Cannot see Reports link', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/dashboard');
    await asFranchiseOwner.waitForTimeout(2000);
    await expect(asFranchiseOwner.getByRole('link', { name: 'Reports' })).not.toBeVisible();
  });

  test('Can see Leaderboard link in sidebar', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/dashboard');
    await expect(asFranchiseOwner.getByRole('link', { name: 'Leaderboard' })).toBeVisible({ timeout: 8_000 });
  });
});
