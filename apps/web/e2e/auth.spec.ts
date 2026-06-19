import { test as base, expect } from '@playwright/test';
import { mockApiAs, ADMIN_USER } from './fixtures';

base.describe('Login page', () => {
  base.test('renders login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  base.test('shows validation error for invalid email', async ({ page }) => {
    await page.goto('/login');
    // Leave email empty — HTML5 type="email" allows empty values (no required attr),
    // but Zod z.string().email() rejects "", surfacing the "Invalid email" error message.
    await page.locator('input[type="password"]').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Invalid email')).toBeVisible({ timeout: 5_000 });
  });

  base.test('shows validation error for short password', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.locator('input[type="password"]').fill('short');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('p.text-danger')).toBeVisible({ timeout: 5_000 });
  });

  base.test('shows validation errors for empty submit', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Invalid email')).toBeVisible({ timeout: 5_000 });
  });

  base.test('successful login redirects to dashboard', async ({ page }) => {
    // Register routes WITHOUT pre-setting cookies so /login is not redirected by middleware
    await page.route('**/api/v1/**', (r) =>
      r.fulfill({ json: { data: [], meta: { total: 0 } } }),
    );
    await page.route('**/api/v1/auth/me', (r) =>
      r.fulfill({ json: { data: ADMIN_USER } }),
    );
    // Login mock sets cookies so middleware allows /dashboard after redirect
    await page.route('**/api/v1/auth/login', async (route) => {
      await page.context().addCookies([
        { name: 'excess_session', value: 'test-session-token', domain: 'localhost', path: '/' },
        { name: 'excess_role', value: 'ADMIN', domain: 'localhost', path: '/' },
      ]);
      await route.fulfill({ json: { data: { user: ADMIN_USER } } });
    });

    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@excessindia.com');
    await page.locator('input[type="password"]').fill('ExcessAdmin2024!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/dashboard', { timeout: 10_000 });
  });

  base.test('shows error toast on failed login', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (r) =>
      r.fulfill({
        status: 401,
        json: { error: { code: 'invalid_credentials', message: 'Invalid email or password' } },
      }),
    );
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('wrong@example.com');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Invalid email or password')).toBeVisible({ timeout: 5_000 });
  });

  base.test('forgot password link is present', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
  });
});

base.describe('Auth redirect', () => {
  base.test('unauthenticated access to dashboard redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });
});

base.describe('Logout', () => {
  base.test('logout clears session and redirects to login', async ({ page }) => {
    await mockApiAs(page, ADMIN_USER);
    await page.goto('/dashboard');
    await expect(page.getByText('Excess Admin')).toBeVisible({ timeout: 10_000 });
    await page.getByTitle('Sign out').click();
    await expect(page).toHaveURL('/login', { timeout: 8_000 });
  });
});
