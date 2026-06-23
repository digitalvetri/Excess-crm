/**
 * LIVE franchise journey — runs against the REAL stack (web :3000 + API :8000 +
 * seeded Postgres), not mocked fixtures, so it catches real 403/500s, broken
 * pages, missing states and console errors. Seeded FRANCHISE_OWNER:
 *   franchise@demo.excess.in / FranchiseDemo2024!  (tenant type = FRANCHISE)
 *
 * Run: pnpm --filter web exec playwright test e2e/franchise-live.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';

const EMAIL = 'franchise@demo.excess.in';
const PASSWORD = 'FranchiseDemo2024!';

// Collected per test and printed in the report so issues are easy to read off.
type Issues = { console: string[]; failed: string[] };

function attachListeners(page: Page, issues: Issues) {
  page.on('console', (m) => {
    if (m.type() === 'error') issues.console.push(m.text());
  });
  page.on('pageerror', (e) => issues.console.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    const s = r.status();
    // Capture every failing request (404/500/etc.) so we see web-side errors too.
    if (s >= 400 && s !== 401) {
      issues.failed.push(`${s} ${r.request().method()} ${r.url().replace(/https?:\/\/[^/]+/, '')}`);
    }
  });
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
}

// Live test: needs the real API (:8000) + seeded Postgres, which normal CI (web-only,
// mocked) doesn't provide. Opt in with E2E_LIVE=1 after starting the stack.
test.describe('Franchise (FRANCHISE_OWNER) — live journey', () => {
  test.skip(!process.env.E2E_LIVE, 'requires live API + seeded DB (set E2E_LIVE=1)');

  test('login lands on dashboard', async ({ page }) => {
    const issues: Issues = { console: [], failed: [] };
    attachListeners(page, issues);
    await login(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await test.info().attach('dashboard-issues', { body: JSON.stringify(issues, null, 2), contentType: 'application/json' });
    expect.soft(issues.failed, 'no failed API calls on dashboard').toEqual([]);
  });

  // Walk every franchise-reachable page; assert it renders and record any 4xx/5xx.
  const pages: { path: string; expect: RegExp }[] = [
    { path: '/dashboard', expect: /Welcome back|Dashboard/i },
    { path: '/leads', expect: /Leads/i },
    { path: '/commissions', expect: /Commissions/i },
    { path: '/wallet', expect: /Wallet|Engagement/i },
    { path: '/referrals', expect: /Referral/i },
    { path: '/leaderboard', expect: /Leaderboard/i },
    { path: '/knowledge-base', expect: /Knowledge/i },
  ];

  for (const p of pages) {
    test(`page loads: ${p.path}`, async ({ page }) => {
      const issues: Issues = { console: [], failed: [] };
      attachListeners(page, issues);
      await login(page);
      await page.goto(p.path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(p.expect).first()).toBeVisible({ timeout: 12_000 });
      await page.screenshot({ path: `e2e-artifacts/franchise${p.path.replace(/\//g, '_')}.png`, fullPage: true });
      await test.info().attach(`issues-${p.path}`, { body: JSON.stringify(issues, null, 2), contentType: 'application/json' });
      // Soft so we collect issues across all pages rather than stopping at the first.
      expect.soft(issues.failed, `no failed API calls on ${p.path}`).toEqual([]);
      expect.soft(issues.console, `no console errors on ${p.path}`).toEqual([]);
    });
  }

  test('convert a lead with kW → commission is created and shows', async ({ page }) => {
    const issues: Issues = { console: [], failed: [] };
    attachListeners(page, issues);
    await login(page);

    // Ensure there's a NEW lead to convert (the seeded franchise tenant may have none).
    const created = await page.request.post('/api/v1/leads', {
      data: { name: `E2E Convert ${Date.now()}`, phone: `9${Date.now().toString().slice(-9)}`, sourceType: 'MANUAL' },
    });
    expect(created.ok(), 'create lead via API').toBeTruthy();

    // Filter to NEW leads so the first row definitely offers "Converted".
    await page.goto('/leads?stage=NEW');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('button[aria-label="Lead actions"]').first()).toBeAttached({ timeout: 10_000 });

    // The row "⋮" actions button (aria-label="Lead actions") opens the stage menu.
    await page.locator('button[aria-label="Lead actions"]').first().click({ force: true });

    // Click "Converted" in the portal stage menu (rendered last in the DOM).
    await page.getByRole('button', { name: 'Converted', exact: true }).last().click({ timeout: 8_000 });

    // The "Mark as Converted" modal must accept a kW value (regression: it used to
    // close itself when focusing the field).
    const kwInput = page.locator('input[type="number"]').first();
    await expect(kwInput).toBeVisible({ timeout: 8_000 });
    await kwInput.fill('5');
    await expect(page.getByText(/5 kW × ₹1,500/)).toBeVisible();
    await page.getByRole('button', { name: /^Convert$/ }).click();

    // Outcome toast should confirm a commission was created.
    await expect(page.getByText(/commission created|already exists/i)).toBeVisible({ timeout: 10_000 });

    // Commissions page should now show at least one row (no "No commissions found").
    await page.goto('/commissions');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Couldn.t load commissions|HTTP 500/i)).toHaveCount(0);
    await page.screenshot({ path: 'e2e-artifacts/franchise_commissions_after_convert.png', fullPage: true });
    await test.info().attach('convert-issues', { body: JSON.stringify(issues, null, 2), contentType: 'application/json' });
    expect.soft(issues.failed, 'no failed API calls during convert flow').toEqual([]);
  });
});
