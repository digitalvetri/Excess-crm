/**
 * LIVE EMPLOYEE journey — runs against the REAL stack (web + API + seeded DB).
 * Seeded EMPLOYEE: employee@excessindia.com / ExcessEmp2024! (HQ tenant).
 * Walks every employee-reachable page and records 4xx/5xx + console errors.
 *
 * Run: E2E_LIVE=1 PORT=3000 pnpm --filter web exec playwright test e2e/employee-live.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';

const EMAIL = 'employee@excessindia.com';
const PASSWORD = 'ExcessEmp2024!';

type Issues = { console: string[]; failed: string[] };

function attachListeners(page: Page, issues: Issues) {
  page.on('console', (m) => {
    if (m.type() === 'error') issues.console.push(m.text());
  });
  page.on('pageerror', (e) => issues.console.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    const s = r.status();
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

// Every employee-reachable page (nav roles include EMPLOYEE).
const PAGES: { path: string; heading: RegExp }[] = [
  { path: '/dashboard',        heading: /Welcome back|Dashboard|Pipeline/i },
  { path: '/leads',            heading: /Leads/i },
  { path: '/calls',            heading: /Calls/i },
  { path: '/appointments',     heading: /Appointment/i },
  { path: '/quotations',       heading: /Quotation/i },
  { path: '/projects',         heading: /Project/i },
  { path: '/projects/upsell',  heading: /Upsell/i },
  { path: '/service-tickets',  heading: /Service|Ticket/i },
  { path: '/amc',              heading: /AMC|Contract/i },
  { path: '/whatsapp',         heading: /WhatsApp/i },
  { path: '/broadcasts',       heading: /Broadcast/i },
  { path: '/reports',          heading: /Report/i },
  { path: '/insights',         heading: /Insight/i },
  { path: '/engagement',       heading: /Engagement|Leaderboard|Referral/i },
  { path: '/referrals',        heading: /Referral/i },
  { path: '/leaderboard',      heading: /Leaderboard/i },
  { path: '/reviews',          heading: /Review/i },
  { path: '/knowledge-base',   heading: /Knowledge/i },
];

test.describe('Employee (EMPLOYEE) — live page sweep', () => {
  test.skip(!process.env.E2E_LIVE, 'requires live API + seeded DB (set E2E_LIVE=1)');

  test('login lands on dashboard', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  for (const p of PAGES) {
    test(`page: ${p.path}`, async ({ page }) => {
      const issues: Issues = { console: [], failed: [] };
      attachListeners(page, issues);
      await login(page);
      await page.goto(p.path);
      await page.waitForLoadState('networkidle');

      // Heading/content renders (some render-state proof, not a blank/error page).
      const heading = page.getByText(p.heading).first();
      const headingVisible = await heading.isVisible().catch(() => false);

      await page.screenshot({ path: `e2e-artifacts/employee${p.path.replace(/\//g, '_')}.png`, fullPage: true });
      await test.info().attach(`issues-${p.path}`, {
        body: JSON.stringify({ headingVisible, ...issues }, null, 2),
        contentType: 'application/json',
      });

      // Soft assertions so the sweep reports ALL issues instead of stopping at the first.
      expect.soft(headingVisible, `${p.path}: expected content (${p.heading}) visible`).toBeTruthy();
      expect.soft(issues.failed, `${p.path}: no failed API calls`).toEqual([]);
      expect.soft(issues.console, `${p.path}: no console errors`).toEqual([]);
    });
  }
});
