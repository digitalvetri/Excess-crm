import {
  test,
  expect,
  FRANCHISE_OWNER_USER,
  FRANCHISE_USER_USER,
  LEADS_LIST,
  NOTIFICATIONS,
} from './fixtures';

// NOTIFICATIONS is used by the asFranchiseOwner / asFranchiseUser fixtures via
// mockApiAs, which mounts it on **/api/v1/notifications**. The import here makes
// the dependency explicit and keeps the test file self-documenting.
void NOTIFICATIONS;

// ── FRANCHISE_OWNER ───────────────────────────────────────────────────────────

test.describe('FranchiseDashboard — FRANCHISE_OWNER', () => {
  test('dashboard loads and shows Welcome banner, not the admin pipeline funnel', async ({
    asFranchiseOwner,
  }) => {
    await asFranchiseOwner.goto('/dashboard');
    // DashboardBanner renders "Welcome back, {firstName} 👋"
    const firstName = FRANCHISE_OWNER_USER.name.split(' ')[0];
    await expect(
      asFranchiseOwner.getByText(new RegExp(`Welcome back, ${firstName}`)),
    ).toBeVisible({ timeout: 10_000 });
    // PipelineFunnel is admin-only — must NOT appear for franchise users
    await expect(
      asFranchiseOwner.locator('h2', { hasText: 'Pipeline Funnel' }),
    ).not.toBeVisible();
  });

  test('nav shows Leads link', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/dashboard');
    // Expand the "My Leads" nav group (collapsed by default on /dashboard)
    await asFranchiseOwner.locator('nav').getByRole('button', { name: 'My Leads' }).click();
    await expect(
      asFranchiseOwner.locator('nav').getByRole('link', { name: 'My Leads' }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('nav shows Commissions link', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/dashboard');
    // Commissions lives inside the "My Earnings" group (FRANCHISE_OWNER only)
    await asFranchiseOwner.locator('nav').getByRole('button', { name: 'My Earnings' }).click();
    await expect(
      asFranchiseOwner.locator('nav').getByRole('link', { name: 'Commissions' }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('nav shows Leaderboard link', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/dashboard');
    // Leaderboard is inside "My Earnings" for FRANCHISE_OWNER (not "My Leads")
    await asFranchiseOwner.locator('nav').getByRole('button', { name: 'My Earnings' }).click();
    await expect(
      asFranchiseOwner.locator('nav').getByRole('link', { name: 'Leaderboard' }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('nav does NOT show Voice Agent', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/dashboard');
    // Wait for auth/role resolution before asserting absence
    await asFranchiseOwner.waitForTimeout(2_000);
    // exact: true guards against accidentally matching partial strings like "AI Voice Agent"
    await expect(
      asFranchiseOwner.locator('nav').getByText('Voice Agent', { exact: true }),
    ).not.toBeVisible();
  });

  test('nav does NOT show Reports', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/dashboard');
    await asFranchiseOwner.waitForTimeout(2_000);
    // "Reports" is a link inside the Analytics group, visible only to ADMIN/EMPLOYEE
    await expect(
      asFranchiseOwner.locator('nav').getByText('Reports'),
    ).not.toBeVisible();
  });

  test('nav does NOT show Settings', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/dashboard');
    await asFranchiseOwner.waitForTimeout(2_000);
    // Settings group is restricted to ADMIN
    await expect(
      asFranchiseOwner.locator('nav').getByText('Settings'),
    ).not.toBeVisible();
  });
});

// ── FRANCHISE_USER ────────────────────────────────────────────────────────────

test.describe('FranchiseDashboard — FRANCHISE_USER', () => {
  test('dashboard loads without error', async ({ asFranchiseUser }) => {
    await asFranchiseUser.goto('/dashboard');
    // Sidebar footer always shows the authenticated user's name
    await expect(
      asFranchiseUser.getByText(FRANCHISE_USER_USER.name),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('nav shows Leads', async ({ asFranchiseUser }) => {
    await asFranchiseUser.goto('/dashboard');
    // Expand the "My Leads" group — FRANCHISE_USER has Leads, Referrals, Leaderboard inside
    await asFranchiseUser.locator('nav').getByRole('button', { name: 'My Leads' }).click();
    await expect(
      asFranchiseUser.locator('nav').getByRole('link', { name: 'My Leads' }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('nav shows Leaderboard', async ({ asFranchiseUser }) => {
    await asFranchiseUser.goto('/dashboard');
    // For FRANCHISE_USER, Leaderboard is inside "My Leads" (not "My Earnings")
    await asFranchiseUser.locator('nav').getByRole('button', { name: 'My Leads' }).click();
    await expect(
      asFranchiseUser.locator('nav').getByRole('link', { name: 'Leaderboard' }),
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ── Franchise leads access ────────────────────────────────────────────────────

test.describe('Franchise leads access', () => {
  test('can navigate to /leads', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/dashboard');
    await asFranchiseOwner.locator('nav').getByRole('button', { name: 'My Leads' }).click();
    await asFranchiseOwner.locator('nav').getByRole('link', { name: 'My Leads' }).click();
    await expect(asFranchiseOwner).toHaveURL('/leads', { timeout: 8_000 });
  });

  test('leads page renders a heading with text Leads', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/leads');
    await expect(
      asFranchiseOwner.getByRole('heading', { name: 'Leads' }).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('lead names from mock data are visible', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/leads');
    // Names come from LEADS_LIST mock wired up in the asFranchiseOwner fixture
    await expect(
      asFranchiseOwner.getByText(LEADS_LIST.data.leads[0].name),
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      asFranchiseOwner.getByText(LEADS_LIST.data.leads[1].name),
    ).toBeVisible();
  });
});
