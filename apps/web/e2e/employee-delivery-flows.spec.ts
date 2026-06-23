/**
 * PHASE 2 — Employee Delivery action flows (live stack). Drives the real project,
 * service-ticket and AMC lifecycles through the web proxy + API with a live
 * EMPLOYEE session. Seeded: employee@excessindia.com / ExcessEmp2024!.
 *
 * Run: E2E_LIVE=1 PORT=3000 pnpm --filter web exec playwright test e2e/employee-delivery-flows.spec.ts --project=chromium
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

const PROJECT_STAGES = ['SURVEY', 'DESIGN', 'MATERIAL_ORDERED', 'INSTALLATION', 'COMMISSIONING', 'HANDED_OVER'];

async function firstProject(page: Page) {
  const d = (await ok(await page.request.get(`${API}/projects?limit=3`), 'projects')).data;
  return (Array.isArray(d) ? d : d.projects)[0] as { id: string; stage: string };
}
async function firstProjectId(page: Page) {
  return (await firstProject(page)).id;
}
async function firstLeadId(page: Page) {
  return (await ok(await page.request.get(`${API}/leads?limit=1`), 'leads')).data.leads[0].id as string;
}
async function anEngineerId(page: Page) {
  const users = (await ok(await page.request.get(`${API}/users`), 'users')).data as { id: string; role: string }[];
  const eng = users.find((u) => u.role === 'ENGINEER');
  expect(eng, 'a seeded ENGINEER exists').toBeTruthy();
  return eng!.id;
}

test.describe('Employee Delivery flows (Phase 2)', () => {
  test.skip(!process.env.E2E_LIVE, 'requires live API + seeded DB (set E2E_LIVE=1)');

  test('project: stage → payment → subsidy → net-metering', async ({ page }) => {
    await login(page);
    const proj = await firstProject(page);
    const id = proj.id;
    // Transition to a stage different from the current one (patching to the same
    // stage is a no-op → 400 "No fields to update").
    const target = PROJECT_STAGES.find((s) => s !== proj.stage) ?? 'DESIGN';
    await ok(await page.request.patch(`${API}/projects/${id}`, { data: { stage: target } }), 'stage');
    await ok(
      await page.request.post(`${API}/projects/${id}/payments`, {
        data: { type: 'ADVANCE', amountInr: 50000, receivedAt: '2026-06-23T05:30:00.000Z', method: 'UPI' },
      }),
      'payment',
    );
    await ok(await page.request.patch(`${API}/projects/${id}/subsidy`, { data: { subsidyStatus: 'APPLIED' } }), 'subsidy');
    await ok(
      await page.request.patch(`${API}/projects/${id}/net-metering`, { data: { netMeteringStatus: 'SLD_SUBMITTED' } }),
      'net-metering',
    );
  });

  test('service ticket: create → assign → comment → resolve', async ({ page }) => {
    await login(page);
    const leadId = await firstLeadId(page);
    const engineerId = await anEngineerId(page);
    const ticket = await ok(
      await page.request.post(`${API}/service-tickets`, {
        data: { leadId, type: 'COMPLAINT', subject: 'E2E ticket', description: 'Panel issue via e2e', priority: 'P2' },
      }),
      'create ticket',
    );
    const id = ticket.data.id;
    await ok(await page.request.patch(`${API}/service-tickets/${id}`, { data: { assignedEngineerId: engineerId } }), 'assign');
    await ok(await page.request.post(`${API}/service-tickets/${id}/comments`, { data: { text: 'On the way' } }), 'comment');
    await ok(await page.request.patch(`${API}/service-tickets/${id}`, { data: { status: 'RESOLVED' } }), 'resolve');
  });

  test('AMC: create → renew', async ({ page }) => {
    await login(page);
    const projectId = await firstProjectId(page);
    const amc = await ok(
      await page.request.post(`${API}/amc-contracts`, {
        data: { projectId, planYears: 1, startDate: '2026-06-23', valueInr: 5000 },
      }),
      'create AMC',
    );
    await ok(await page.request.post(`${API}/amc-contracts/${amc.data.id}/renew`, { data: { planYears: 1 } }), 'renew');
  });
});
