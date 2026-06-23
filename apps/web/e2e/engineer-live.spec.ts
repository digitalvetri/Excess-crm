/**
 * LIVE ENGINEER journey — read-only field surface against the REAL stack.
 * Seeded ENGINEER: arjun.n@excessindia.com / Engineer2024! (HQ tenant).
 * Engineers have read-only perms (appointments/projects/service_tickets/kb .read);
 * field writes happen via the public /survey form + the mobile app.
 *
 * Run: E2E_LIVE=1 PORT=3000 pnpm --filter web exec playwright test e2e/engineer-live.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';

const EMAIL = 'arjun.n@excessindia.com';
const PASSWORD = 'Engineer2024!';

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

const PAGES: { path: string; heading: RegExp }[] = [
  { path: '/dashboard',       heading: /Dashboard|Welcome|Appointment|Today/i },
  { path: '/appointments',    heading: /Appointment/i },
  { path: '/projects',        heading: /Project/i },
  { path: '/service-tickets', heading: /Service|Ticket/i },
  { path: '/knowledge-base',  heading: /Knowledge/i },
];

test.describe('Engineer (ENGINEER) — live read-only sweep', () => {
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

      const headingVisible = await page.getByText(p.heading).first().isVisible().catch(() => false);
      await page.screenshot({ path: `e2e-artifacts/engineer${p.path.replace(/\//g, '_')}.png`, fullPage: true });
      await test.info().attach(`issues-${p.path}`, {
        body: JSON.stringify({ headingVisible, ...issues }, null, 2),
        contentType: 'application/json',
      });

      expect.soft(headingVisible, `${p.path}: expected content (${p.heading}) visible`).toBeTruthy();
      expect.soft(issues.failed, `${p.path}: no failed API calls (engineer read pages must not hit forbidden endpoints)`).toEqual([]);
      expect.soft(issues.console, `${p.path}: no console errors`).toEqual([]);
    });
  }
});
