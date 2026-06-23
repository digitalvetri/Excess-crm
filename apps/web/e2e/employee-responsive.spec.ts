/**
 * PHASE 4 — Employee responsive audit. Loads key pages at 360 / 768 / 1280 and
 * flags horizontal overflow (content wider than the viewport = a layout bug).
 *
 * Run: E2E_LIVE=1 PORT=3000 pnpm --filter web exec playwright test e2e/employee-responsive.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';

const EMAIL = 'employee@excessindia.com';
const PASSWORD = 'ExcessEmp2024!';

const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 740 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 800 },
];

const PAGES = ['/dashboard', '/leads', '/appointments', '/quotations', '/projects', '/service-tickets', '/reports', '/engagement'];

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
}

test.describe('Employee responsive audit (Phase 4)', () => {
  test.skip(!process.env.E2E_LIVE, 'requires live API + seeded DB (set E2E_LIVE=1)');

  for (const vp of VIEWPORTS) {
    test(`no horizontal overflow @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page);

      const offenders: string[] = [];
      for (const path of PAGES) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        // 2px tolerance for sub-pixel rounding.
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          return Math.max(0, doc.scrollWidth - window.innerWidth);
        });
        if (overflow > 2) offenders.push(`${path} (+${overflow}px)`);
        await page.screenshot({ path: `e2e-artifacts/resp-${vp.name}${path.replace(/\//g, '_')}.png` });
      }
      await test.info().attach(`overflow-${vp.name}`, { body: JSON.stringify(offenders, null, 2), contentType: 'application/json' });
      expect.soft(offenders, `pages with horizontal overflow @ ${vp.width}px`).toEqual([]);
    });
  }
});
