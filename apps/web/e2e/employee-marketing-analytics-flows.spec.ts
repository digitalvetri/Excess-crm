/**
 * PHASE 3 — Employee Marketing & Analytics flows (live stack). Drives WhatsApp,
 * broadcasts, reports, insights and CSV export through the web proxy + API with a
 * live EMPLOYEE session. Seeded: employee@excessindia.com / ExcessEmp2024!.
 *
 * Run: E2E_LIVE=1 PORT=3000 pnpm --filter web exec playwright test e2e/employee-marketing-analytics-flows.spec.ts --project=chromium
 */
import { test, expect, type Page, type APIResponse } from '@playwright/test';

const EMAIL = 'employee@excessindia.com';
const PASSWORD = 'ExcessEmp2024!';
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

test.describe('Employee Marketing & Analytics flows (Phase 3)', () => {
  test.skip(!process.env.E2E_LIVE, 'requires live API + seeded DB (set E2E_LIVE=1)');

  test('whatsapp: config → status → send (queued)', async ({ page }) => {
    await login(page);
    await ok(await page.request.get(`${API}/whatsapp/config`), 'whatsapp config');
    await ok(await page.request.get(`${API}/whatsapp/status`), 'whatsapp status');
    const leadId = (await ok(await page.request.get(`${API}/leads?limit=1`), 'leads')).data.leads[0].id;
    // Enqueues to the whatsappSend worker; returns 202 even without live Meta creds.
    await ok(await page.request.post(`${API}/whatsapp/send`, { data: { leadId, message: 'E2E hello' } }), 'whatsapp send');
  });

  test('broadcast: create → preview → start', async ({ page }) => {
    await login(page);
    await ok(await page.request.get(`${API}/broadcasts/templates`), 'templates');
    await ok(await page.request.get(`${API}/broadcasts/audience-presets`), 'audience presets');
    const bc = await ok(
      await page.request.post(`${API}/broadcasts`, {
        data: { name: `E2E Broadcast ${Date.now()}`, bodyText: 'Hello {{name}}', audienceFilter: { stages: ['NEW'] } },
      }),
      'create broadcast',
    );
    await ok(
      await page.request.post(`${API}/broadcasts/preview`, { data: { audienceFilter: { stages: ['NEW'] } } }),
      'preview',
    );
    await ok(await page.request.post(`${API}/broadcasts/${bc.data.id}/start`, { data: {} }), 'start');
  });

  test('reports: all sections return data', async ({ page }) => {
    await login(page);
    const sections = ['funnel', 'calls', 'sources', 'daily', 'agents', 'revenue-pipeline', 'nps', 'territory-revenue'];
    for (const s of sections) {
      await ok(await page.request.get(`${API}/reports/${s}`), `report:${s}`);
    }
  });

  test('insights: cohorts → forecast → conversations', async ({ page }) => {
    await login(page);
    await ok(await page.request.get(`${API}/reports/cohorts`), 'cohorts');
    await ok(await page.request.get(`${API}/reports/forecast`), 'forecast');
    await ok(await page.request.get(`${API}/reports/conversations`), 'conversations');
  });

  test('CSV export: leads export returns a CSV attachment', async ({ page }) => {
    await login(page);
    const r = await page.request.get(`${API}/leads/export`);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type'] ?? '').toContain('text/csv');
    const body = await r.text();
    expect(body.split('\n')[0]).toContain('Name'); // header row
  });
});
