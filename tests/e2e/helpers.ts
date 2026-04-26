import type { Page } from '@playwright/test';

export const E2E_ADMIN_EMAIL =
  process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'e2e-admin@flowcorewater.test';
export const E2E_ADMIN_PASSWORD =
  process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'e2e-admin-pass-1234';

export async function login(
  page: Page,
  email: string = E2E_ADMIN_EMAIL,
  password: string = E2E_ADMIN_PASSWORD,
): Promise<void> {
  await page.goto('/auth/login');
  await page.locator('[data-testid="login-email"]').fill(email);
  await page.locator('[data-testid="login-password"]').fill(password);
  await page.locator('[data-testid="login-submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/login'), {
    timeout: 10_000,
  });
}
