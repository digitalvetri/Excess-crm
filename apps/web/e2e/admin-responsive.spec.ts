/**
 * Admin responsive audit — admin-only pages (Voice Agent, Settings, Teams, Users,
 * Franchise, Payouts) at 360 / 768 / 1280. Flags horizontal overflow.
 *
 * Run: E2E_LIVE=1 PORT=3000 pnpm --filter web exec playwright test e2e/admin-responsive.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';

const EMAIL = 'admin@excessindia.com';
const PASSWORD = 'ExcessAdmin2024!';

const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 740 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 800 },
];

// Admin-only surface not covered by the employee responsive audit.
const PAGES = [
  '/voice-agent/playground',
  '/voice-agent/personas',
  '/voice-agent/monitor',
  '/voice-agent/ab-testing',
  '/voice-agent/settings',
  '/franchise',
  '/commissions',
  '/payouts',
  '/teams',
  '/settings/users',
  '/settings/sla-rules',
  '/settings/webhooks',
];

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
}

test.describe('Admin responsive audit', () => {
  test.skip(!process.env.E2E_LIVE, 'requires live API + seeded DB (set E2E_LIVE=1)');

  for (const vp of VIEWPORTS) {
    test(`no horizontal overflow @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page);

      const offenders: string[] = [];
      for (const path of PAGES) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() =>
          Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        );
        if (overflow > 2) offenders.push(`${path} (+${overflow}px)`);
      }
      await test.info().attach(`overflow-${vp.name}`, { body: JSON.stringify(offenders, null, 2), contentType: 'application/json' });
      expect.soft(offenders, `pages with horizontal overflow @ ${vp.width}px`).toEqual([]);
    });
  }
});
