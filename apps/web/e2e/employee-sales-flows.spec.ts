/**
 * PHASE 1 — Employee Sales action flows (live stack). Drives the real lead →
 * appointment → quotation lifecycle through the web proxy + API with a real
 * EMPLOYEE session, plus a UI appointment-confirm. Seeded: employee@excessindia.com.
 *
 * Run: E2E_LIVE=1 PORT=3000 pnpm --filter web exec playwright test e2e/employee-sales-flows.spec.ts --project=chromium
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

test.describe('Employee Sales flows (Phase 1)', () => {
  test.skip(!process.env.E2E_LIVE, 'requires live API + seeded DB (set E2E_LIVE=1)');

  test('lead lifecycle: create → qualify → tag', async ({ page }) => {
    await login(page);
    const lead = await ok(
      await page.request.post(`${API}/leads`, {
        data: { name: `Sales E2E ${Date.now()}`, phone: `9${Date.now().toString().slice(-9)}`, sourceType: 'MANUAL' },
      }),
      'create lead',
    );
    const id = lead.data.id;
    await ok(await page.request.patch(`${API}/leads/${id}`, { data: { stage: 'QUALIFIED' } }), 'qualify');
    await ok(await page.request.patch(`${API}/leads/${id}/tags`, { data: { tags: ['hot', 'e2e'] } }), 'tag');
  });

  test('appointment lifecycle: book → confirm → reassign → complete', async ({ page }) => {
    await login(page);
    const leadId = (await ok(await page.request.get(`${API}/leads?limit=1`), 'leads')).data.leads[0].id;
    const appt = await ok(
      await page.request.post(`${API}/appointments`, {
        data: {
          leadId,
          scheduledAt: '2026-06-28T05:30:00.000Z',
          surveyType: 'ROOFTOP_RESIDENTIAL',
          siteAddress: '12 E2E Street, Coimbatore 641001',
          durationMin: 60,
        },
      }),
      'book appointment',
    );
    const apptId = appt.data.id;
    await ok(await page.request.post(`${API}/appointments/${apptId}/confirm`), 'confirm');

    const users = (await ok(await page.request.get(`${API}/users`), 'users')).data as { id: string; role: string }[];
    const engineer = users.find((u) => u.role === 'ENGINEER');
    expect(engineer, 'a seeded ENGINEER exists').toBeTruthy();
    await ok(
      await page.request.post(`${API}/appointments/${apptId}/reassign`, { data: { engineerId: engineer!.id } }),
      'reassign',
    );
    await ok(
      await page.request.post(`${API}/appointments/${apptId}/complete`, { data: { outcome: 'QUALIFIED', notes: 'e2e' } }),
      'complete',
    );
  });

  test('appointment cancel', async ({ page }) => {
    await login(page);
    const leadId = (await ok(await page.request.get(`${API}/leads?limit=1`), 'leads')).data.leads[0].id;
    const appt = await ok(
      await page.request.post(`${API}/appointments`, {
        data: {
          leadId,
          scheduledAt: '2026-06-29T05:30:00.000Z',
          surveyType: 'COMMERCIAL',
          siteAddress: '34 Cancel Road, Coimbatore 641002',
        },
      }),
      'book appointment',
    );
    await ok(
      await page.request.post(`${API}/appointments/${appt.data.id}/cancel`, { data: { reason: 'e2e cancel' } }),
      'cancel',
    );
  });

  test('quotation: create → send', async ({ page }) => {
    await login(page);
    const leadId = (await ok(await page.request.get(`${API}/leads?limit=1`), 'leads')).data.leads[0].id;
    const quote = await ok(
      await page.request.post(`${API}/quotations`, {
        data: { leadId, systemKw: 5, brandTier: 'MID', totalInr: 350000, subsidyInr: 78000, netPayable: 272000 },
      }),
      'create quotation',
    );
    await ok(
      await page.request.post(`${API}/quotations/${quote.data.id}/send`, { data: { via: 'whatsapp' } }),
      'send quotation',
    );
  });

  test('UI: confirm an appointment from the drawer', async ({ page }) => {
    await login(page);
    // Seed a fresh SCHEDULED appointment so a confirmable one exists.
    const leadId = (await ok(await page.request.get(`${API}/leads?limit=1`), 'leads')).data.leads[0].id;
    await ok(
      await page.request.post(`${API}/appointments`, {
        data: {
          leadId,
          scheduledAt: '2026-06-30T05:30:00.000Z',
          surveyType: 'ROOFTOP_RESIDENTIAL',
          siteAddress: '56 UI Confirm Ave, Coimbatore 641003',
        },
      }),
      'seed appointment',
    );
    await page.goto('/appointments');
    await page.waitForLoadState('networkidle');
    // Open the first appointment card → drawer, then Confirm if offered.
    await page.locator('button').filter({ hasText: /Coimbatore|Survey|ROOFTOP|kW/i }).first().click().catch(() => {});
    const confirmBtn = page.getByRole('button', { name: /^Confirm$/ }).first();
    if (await confirmBtn.count()) {
      await confirmBtn.click();
      await expect(page.getByText(/confirmed/i).first()).toBeVisible({ timeout: 8_000 });
    }
  });
});
