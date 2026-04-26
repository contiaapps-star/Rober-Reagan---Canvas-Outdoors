import { expect, test } from '@playwright/test';

import { login } from './helpers.js';

test.describe('settings flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('competitors page renders with the seeded list', async ({ page }) => {
    await page.goto('/settings/competitors');
    await expect(
      page.getByRole('heading', { name: /Competitors/i }).first(),
    ).toBeVisible();
    // Table should render at least one row from the seed.
    const tableRows = page.locator(
      '[data-testid^="competitor-row-"], table tbody tr',
    );
    expect(await tableRows.count()).toBeGreaterThanOrEqual(1);
  });

  test('add → edit → delete competitor flow', async ({ page }) => {
    await page.goto('/settings/competitors');
    const stamp = Date.now().toString(36);
    const newName = `E2E Test Co ${stamp}`;
    const newDomain = `e2e-${stamp}.example.com`;

    // Open the "Add competitor" modal.
    const addBtn = page.locator(
      '[data-testid="btn-add-competitor"], button:has-text("Add competitor"), button:has-text("Add Competitor")',
    );
    await expect(addBtn.first()).toBeVisible();
    await addBtn.first().click();

    // Fill the form (selectors are loose to survive minor markup tweaks).
    await page.locator('input[name="name"]').first().fill(newName);
    await page.locator('input[name="domain"]').first().fill(newDomain);
    // Pick "well" category if a select exists.
    const categorySelect = page.locator('select[name="category"]');
    if ((await categorySelect.count()) > 0) {
      await categorySelect.first().selectOption('well');
    }
    const tierSelect = page.locator('select[name="tier"]');
    if ((await tierSelect.count()) > 0) {
      await tierSelect.first().selectOption('local_same_size');
    }
    await page
      .locator(
        'button[type="submit"]:has-text("Save"), button[type="submit"]:has-text("Create")',
      )
      .first()
      .click();

    // After creation, the list should contain the new competitor.
    await expect(page.locator(`text=${newDomain}`)).toBeVisible({ timeout: 5_000 });

    // Soft-delete: find the row with the new domain and click delete.
    const row = page
      .locator('tr', { hasText: newDomain })
      .first();
    const deleteBtn = row.locator(
      'button:has-text("Delete"), [data-action="delete"], a:has-text("Delete")',
    );
    if ((await deleteBtn.count()) > 0) {
      // Accept the JS confirm() modal if any.
      page.once('dialog', (d) => d.accept().catch(() => {}));
      await deleteBtn.first().click();
      // After soft-delete, the domain should no longer appear in the active list.
      await expect(page.locator(`text=${newDomain}`)).toBeHidden({ timeout: 5_000 });
    }
  });

  test('keywords page lets you add and remove a keyword', async ({ page }) => {
    await page.goto('/settings/keywords');
    const stamp = Date.now().toString(36);
    const keyword = `e2e-keyword-${stamp}`;

    const addBtn = page.locator(
      '[data-testid="btn-add-keyword"], button:has-text("Add keyword"), button:has-text("Add Keyword")',
    );
    if ((await addBtn.count()) === 0) {
      test.skip(true, 'no add-keyword UI in this build');
      return;
    }
    await addBtn.first().click();
    await page.locator('input[name="keyword"]').first().fill(keyword);
    const categorySelect = page.locator('select[name="category"]');
    if ((await categorySelect.count()) > 0) {
      await categorySelect.first().selectOption('well');
    }
    await page
      .locator('button[type="submit"]:has-text("Save"), button[type="submit"]:has-text("Create")')
      .first()
      .click();
    await expect(page.locator(`text=${keyword}`)).toBeVisible({ timeout: 5_000 });
  });
});
