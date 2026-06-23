/**
 * ADMIN action flows (live stack) — the admin-only management surface beyond the
 * employee flows. Seeded ADMIN: admin@excessindia.com / ExcessAdmin2024!.
 *
 * Run: E2E_LIVE=1 PORT=3000 pnpm --filter web exec playwright test e2e/admin-flows.spec.ts --project=chromium
 */
import { test, expect, type Page, type APIResponse } from '@playwright/test';

const EMAIL = 'admin@excessindia.com';
const PASSWORD = 'ExcessAdmin2024!';
const API = '/api/v1';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
}

async function ok(r: APIResponse, label: string) {
  expect(r.status(), `${label} → ${r.status()} ${await r.text().catch(() => '')}`).toBeLessThan(300);
  return r.json().catch(() => ({}));
}

// Unique-ish suffix without Date.now() collisions across tests in one run.
function uniq(i: number) {
  return `${i}-${process.pid}`;
}

test.describe('Admin management flows', () => {
  test.skip(!process.env.E2E_LIVE, 'requires live API + seeded DB (set E2E_LIVE=1)');

  test('franchise: create', async ({ page }) => {
    await login(page);
    await ok(
      await page.request.post(`${API}/franchise`, {
        data: { name: `E2E Franchise ${uniq(1)}`, tier: 'SILVER', contactEmail: `e2e-fr-${uniq(1)}@test.com` },
      }),
      'create franchise',
    );
  });

  test('team: create', async ({ page }) => {
    await login(page);
    await ok(await page.request.post(`${API}/teams`, { data: { name: `E2E Team ${uniq(2)}` } }), 'create team');
  });

  test('user: create employee', async ({ page }) => {
    await login(page);
    await ok(
      await page.request.post(`${API}/users/admin`, {
        data: { email: `e2e-user-${uniq(3)}@test.com`, name: 'E2E User', role: 'EMPLOYEE', password: 'TestPass123!' },
      }),
      'create user',
    );
  });

  test('commission: approve → payout', async ({ page }) => {
    await login(page);
    const pending = (await ok(await page.request.get(`${API}/commissions?status=PENDING_APPROVAL`), 'pending commissions'))
      .data.commissions as { id: string }[];
    test.skip(pending.length === 0, 'no pending commissions to approve');
    const id = pending[0].id;
    await ok(await page.request.post(`${API}/commissions/${id}/approve`), 'approve commission');
    await ok(await page.request.post(`${API}/payouts`, { data: { commissionIds: [id] } }), 'create payout');
  });

  test('voice agent: test-dial (EXCESS_AGENT) queues', async ({ page }) => {
    await login(page);
    await ok(
      await page.request.post(`${API}/voice-agent/test-dial`, {
        data: { phone: '9876500088', name: 'E2E Dial', personaId: 'EXCESS_AGENT' },
      }),
      'test-dial',
    );
  });

  test('settings: create webhook + SLA rule', async ({ page }) => {
    await login(page);
    await ok(
      await page.request.post(`${API}/settings/webhooks`, {
        data: { url: 'https://example.com/hook', events: ['lead.created'] },
      }),
      'create webhook',
    );
    await ok(
      await page.request.post(`${API}/sla-rules`, { data: { stage: 'NEW', thresholdHours: 24, action: 'NOTIFY' } }),
      'create sla rule',
    );
  });
});
