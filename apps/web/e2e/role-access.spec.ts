import {
  test,
  expect,
  ADMIN_USER,
  EMPLOYEE_USER,
  FRANCHISE_OWNER_USER,
  FRANCHISE_USER_USER,
  ENGINEER_USER,
} from './fixtures';

// ── ADMIN — full access ───────────────────────────────────────────────────────

test.describe('ADMIN — full access', () => {
  test.beforeEach(async ({ asAdmin }) => {
    // Catch-all returns empty data; more-specific mocks registered after win (LIFO).
    await asAdmin.route('**/api/v1/**', (r) =>
      r.fulfill({ json: { data: [], meta: { total: 0 } } }),
    );
    await asAdmin.route('**/api/v1/auth/me', (r) =>
      r.fulfill({ json: { data: ADMIN_USER } }),
    );
    await asAdmin.route('**/api/v1/notifications**', (r) =>
      r.fulfill({ json: { data: [], meta: { unreadCount: 0 } } }),
    );
  });

  test('can access /settings', async ({ asAdmin }) => {
    await asAdmin.goto('/settings');
    await expect(asAdmin).not.toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('can access /franchise', async ({ asAdmin }) => {
    await asAdmin.goto('/franchise');
    await expect(asAdmin).not.toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('can access /payouts', async ({ asAdmin }) => {
    await asAdmin.goto('/payouts');
    await expect(asAdmin).not.toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('can access /reports', async ({ asAdmin }) => {
    await asAdmin.goto('/reports');
    await expect(asAdmin).not.toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('can access /teams', async ({ asAdmin }) => {
    await asAdmin.goto('/teams');
    await expect(asAdmin).not.toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('sees "Voice Agent" text in nav sidebar on dashboard', async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    // exact: true avoids matching "AI Voice Agent" h2 in dashboard page content
    await expect(asAdmin.getByText('Voice Agent', { exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test('sees "Settings" text in nav sidebar on dashboard', async ({ asAdmin }) => {
    await asAdmin.goto('/dashboard');
    await expect(asAdmin.getByText('Settings')).toBeVisible({ timeout: 8_000 });
  });
});

// ── EMPLOYEE — blocked from admin areas ──────────────────────────────────────

test.describe('EMPLOYEE — blocked from admin areas', () => {
  test.beforeEach(async ({ asEmployee }) => {
    await asEmployee.route('**/api/v1/**', (r) =>
      r.fulfill({ json: { data: [], meta: { total: 0 } } }),
    );
    await asEmployee.route('**/api/v1/auth/me', (r) =>
      r.fulfill({ json: { data: EMPLOYEE_USER } }),
    );
    await asEmployee.route('**/api/v1/notifications**', (r) =>
      r.fulfill({ json: { data: [], meta: { unreadCount: 0 } } }),
    );
  });

  test('redirects from /settings to /dashboard', async ({ asEmployee }) => {
    await asEmployee.goto('/settings');
    await expect(asEmployee).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('redirects from /franchise to /dashboard', async ({ asEmployee }) => {
    await asEmployee.goto('/franchise');
    await expect(asEmployee).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('redirects from /payouts to /dashboard', async ({ asEmployee }) => {
    await asEmployee.goto('/payouts');
    await expect(asEmployee).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('can access /leads', async ({ asEmployee }) => {
    await asEmployee.goto('/leads');
    await expect(asEmployee).toHaveURL(/\/leads/, { timeout: 5_000 });
  });

  test('can access /appointments', async ({ asEmployee }) => {
    await asEmployee.goto('/appointments');
    await expect(asEmployee).toHaveURL(/\/appointments/, { timeout: 5_000 });
  });

  test('does not see "Settings" in sidebar nav', async ({ asEmployee }) => {
    await asEmployee.goto('/dashboard');
    // Wait for the page to fully render before asserting absence
    await expect(asEmployee.getByText(EMPLOYEE_USER.name)).toBeVisible({ timeout: 10_000 });
    await expect(asEmployee.getByText('Settings')).not.toBeVisible();
  });
});

// ── FRANCHISE_OWNER — franchise-only access ───────────────────────────────────

test.describe('FRANCHISE_OWNER — franchise-only access', () => {
  test.beforeEach(async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.route('**/api/v1/**', (r) =>
      r.fulfill({ json: { data: [], meta: { total: 0 } } }),
    );
    await asFranchiseOwner.route('**/api/v1/auth/me', (r) =>
      r.fulfill({ json: { data: FRANCHISE_OWNER_USER } }),
    );
    await asFranchiseOwner.route('**/api/v1/notifications**', (r) =>
      r.fulfill({ json: { data: [], meta: { unreadCount: 0 } } }),
    );
  });

  test('redirects from /reports to /dashboard', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/reports');
    await expect(asFranchiseOwner).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('redirects from /settings to /dashboard', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/settings');
    await expect(asFranchiseOwner).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('redirects from /calls to /dashboard', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/calls');
    await expect(asFranchiseOwner).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('can access /leads', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/leads');
    await expect(asFranchiseOwner).toHaveURL(/\/leads/, { timeout: 5_000 });
  });

  test('can access /leaderboard', async ({ asFranchiseOwner }) => {
    // /leaderboard redirects into the engagement hub's leaderboard tab, which is
    // role-filtered to be franchise-accessible — it must NOT bounce to /dashboard.
    await asFranchiseOwner.goto('/leaderboard');
    await expect(asFranchiseOwner).toHaveURL(/\/engagement\?tab=leaderboard/, { timeout: 5_000 });
  });

  test('does not see "Voice Agent" in sidebar nav', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.goto('/dashboard');
    // Wait for the page to fully render before asserting absence
    await expect(asFranchiseOwner.getByText(FRANCHISE_OWNER_USER.name)).toBeVisible({ timeout: 10_000 });
    // exact: true avoids matching "AI Voice Agent" h2 in dashboard page content
    await expect(asFranchiseOwner.getByText('Voice Agent', { exact: true })).not.toBeVisible();
  });
});

// ── FRANCHISE_USER — limited franchise access ─────────────────────────────────

test.describe('FRANCHISE_USER — limited franchise access', () => {
  test.beforeEach(async ({ asFranchiseUser }) => {
    await asFranchiseUser.route('**/api/v1/**', (r) =>
      r.fulfill({ json: { data: [], meta: { total: 0 } } }),
    );
    await asFranchiseUser.route('**/api/v1/auth/me', (r) =>
      r.fulfill({ json: { data: FRANCHISE_USER_USER } }),
    );
    await asFranchiseUser.route('**/api/v1/notifications**', (r) =>
      r.fulfill({ json: { data: [], meta: { unreadCount: 0 } } }),
    );
  });

  test('redirects from /reports to /dashboard', async ({ asFranchiseUser }) => {
    await asFranchiseUser.goto('/reports');
    await expect(asFranchiseUser).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('redirects from /appointments to /dashboard', async ({ asFranchiseUser }) => {
    await asFranchiseUser.goto('/appointments');
    await expect(asFranchiseUser).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('can access /leads', async ({ asFranchiseUser }) => {
    await asFranchiseUser.goto('/leads');
    await expect(asFranchiseUser).toHaveURL(/\/leads/, { timeout: 5_000 });
  });
});

// ── ENGINEER — field-work only ────────────────────────────────────────────────

test.describe('ENGINEER — field-work only', () => {
  test.beforeEach(async ({ asEngineer }) => {
    await asEngineer.route('**/api/v1/**', (r) =>
      r.fulfill({ json: { data: [], meta: { total: 0 } } }),
    );
    await asEngineer.route('**/api/v1/auth/me', (r) =>
      r.fulfill({ json: { data: ENGINEER_USER } }),
    );
    await asEngineer.route('**/api/v1/notifications**', (r) =>
      r.fulfill({ json: { data: [], meta: { unreadCount: 0 } } }),
    );
  });

  // Can reach their allowed pages
  test('can access /appointments', async ({ asEngineer }) => {
    await asEngineer.goto('/appointments');
    await expect(asEngineer).not.toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });
  test('can access /projects', async ({ asEngineer }) => {
    await asEngineer.goto('/projects');
    await expect(asEngineer).not.toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });
  test('can access /service-tickets', async ({ asEngineer }) => {
    await asEngineer.goto('/service-tickets');
    await expect(asEngineer).not.toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  // Blocked from sales / admin areas
  test('redirects from /leads to /dashboard', async ({ asEngineer }) => {
    await asEngineer.goto('/leads');
    await expect(asEngineer).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });
  test('redirects from /reports to /dashboard', async ({ asEngineer }) => {
    await asEngineer.goto('/reports');
    await expect(asEngineer).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });
  test('redirects from /settings to /dashboard', async ({ asEngineer }) => {
    await asEngineer.goto('/settings');
    await expect(asEngineer).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });
});

// ── Newly-tightened admin-only areas (allowlist fixes) ────────────────────────

test.describe('Admin-only areas are blocked for non-admins', () => {
  test('EMPLOYEE redirected from /voice-agent', async ({ asEmployee }) => {
    await asEmployee.route('**/api/v1/auth/me', (r) => r.fulfill({ json: { data: EMPLOYEE_USER } }));
    await asEmployee.route('**/api/v1/notifications**', (r) => r.fulfill({ json: { data: [], meta: { unreadCount: 0 } } }));
    await asEmployee.goto('/voice-agent');
    await expect(asEmployee).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('EMPLOYEE redirected from /teams', async ({ asEmployee }) => {
    await asEmployee.route('**/api/v1/auth/me', (r) => r.fulfill({ json: { data: EMPLOYEE_USER } }));
    await asEmployee.route('**/api/v1/notifications**', (r) => r.fulfill({ json: { data: [], meta: { unreadCount: 0 } } }));
    await asEmployee.goto('/teams');
    await expect(asEmployee).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });

  test('FRANCHISE_OWNER redirected from /voice-agent', async ({ asFranchiseOwner }) => {
    await asFranchiseOwner.route('**/api/v1/auth/me', (r) => r.fulfill({ json: { data: FRANCHISE_OWNER_USER } }));
    await asFranchiseOwner.route('**/api/v1/notifications**', (r) => r.fulfill({ json: { data: [], meta: { unreadCount: 0 } } }));
    await asFranchiseOwner.goto('/voice-agent');
    await expect(asFranchiseOwner).toHaveURL(/\/dashboard/, { timeout: 5_000 });
  });
});
