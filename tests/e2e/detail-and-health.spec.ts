import { expect, test } from '@playwright/test';

import { login } from './helpers.js';

test.describe('activity detail + health', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('clicking a detail link opens the activity detail view', async ({ page }) => {
    const detailLink = page
      .locator('a[href^="/activities/"], [data-testid="activity-detail-link"]')
      .first();
    if ((await detailLink.count()) === 0) {
      test.skip(true, 'no activity rows seeded — detail link unavailable');
      return;
    }
    await detailLink.click();
    await expect(page).toHaveURL(/\/activities\//);
    // The detail view always shows a "Why this matters" or summary section
    // somewhere on the page.
    await expect(page.locator('body')).toContainText(/why this matters|summary/i);
  });

  test('health channel grid renders and shows the spend KPI', async ({
    page,
  }) => {
    await page.goto('/health/channels');
    await expect(
      page.getByRole('heading', { name: /Channel Health/i }),
    ).toBeVisible();
    await expect(page.locator('[data-testid="kpi-spend-tile"]')).toBeVisible();
    await expect(page.locator('[data-testid="health-grid"]')).toBeVisible();
  });

  test('admin sees the "Run all daily polls" button on the health page', async ({
    page,
  }) => {
    await page.goto('/health/channels');
    await expect(page.locator('[data-testid="btn-run-all"]')).toBeVisible();
  });
});
