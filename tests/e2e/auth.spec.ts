import { expect, test } from '@playwright/test';

import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, login } from './helpers.js';

test.describe('authentication', () => {
  test('successful login redirects to the dashboard', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Intelligence Board/i }),
    ).toBeVisible();
  });

  test('wrong password shows an inline error and stays on /auth/login', async ({
    page,
  }) => {
    await page.goto('/auth/login');
    await page.locator('[data-testid="login-email"]').fill(E2E_ADMIN_EMAIL);
    await page.locator('[data-testid="login-password"]').fill('definitely-wrong');
    await page.locator('[data-testid="login-submit"]').click();
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-error"]')).toContainText(
      /Invalid email or password/i,
    );
  });

  test('GET / without a session cookie redirects to /auth/login', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto('/');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('logout clears the session and redirects to /auth/login', async ({
    page,
  }) => {
    await login(page);
    await page.locator('[data-testid="sign-out"]').click();
    await expect(page).toHaveURL(/\/auth\/login/);
    // After logout, hitting / again should go to login.
    await page.goto('/');
    await expect(page).toHaveURL(/\/auth\/login/);
    void E2E_ADMIN_PASSWORD;
  });
});
