/**
 * ENGINEER read-only contract (live stack). Engineers view their field work but
 * cannot mutate via the authenticated web app (field writes go through the public
 * /survey form + the mobile app). Seeded: arjun.n@excessindia.com / Engineer2024!.
 *
 * Run: E2E_LIVE=1 PORT=3000 pnpm --filter web exec playwright test e2e/engineer-flows.spec.ts --project=chromium
 */
import { test, expect, type Page } from '@playwright/test';

const EMAIL = 'arjun.n@excessindia.com';
const PASSWORD = 'Engineer2024!';
const API = '/api/v1';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
}

test.describe('Engineer read-only contract', () => {
  test.skip(!process.env.E2E_LIVE, 'requires live API + seeded DB (set E2E_LIVE=1)');

  test('can read field work (appointments, projects, service tickets)', async ({ page }) => {
    await login(page);
    for (const ep of ['appointments', 'projects', 'service-tickets']) {
      const r = await page.request.get(`${API}/${ep}`);
      expect(r.status(), `read ${ep}`).toBe(200);
    }
  });

  test('cannot mutate (writes are forbidden)', async ({ page }) => {
    await login(page);
    const appts = (await (await page.request.get(`${API}/appointments?limit=1`)).json()).data;
    const apptId = (Array.isArray(appts) ? appts : appts.appointments)[0]?.id;

    const complete = await page.request.post(`${API}/appointments/${apptId}/complete`, {
      data: { outcome: 'QUALIFIED' },
    });
    expect(complete.status(), 'appointment complete forbidden').toBe(403);

    const ticket = await page.request.post(`${API}/service-tickets`, {
      data: { leadId: '00000000-0000-0000-0000-000000000000', type: 'COMPLAINT', subject: 'x', description: 'y' },
    });
    expect(ticket.status(), 'ticket create forbidden').toBe(403);

    // Directory endpoints are also forbidden (the UI must not call them — that was the bug).
    const users = await page.request.get(`${API}/users`);
    expect(users.status(), 'users list forbidden').toBe(403);
  });
});
