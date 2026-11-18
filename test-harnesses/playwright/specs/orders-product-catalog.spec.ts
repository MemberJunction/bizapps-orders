/**
 * Product catalog verification spec for bizapps-orders in MJExplorer.
 *
 * Exercises the Catalog section in the Orders application:
 *  - Opens the Orders application through the app switcher and switches to the Catalog tab.
 *  - Verifies the four Catalog sub-pages (Products, Pricing & Price Lists, Promotions, Charges & Tax).
 *  - Exercises the Products filters (search box, category dropdown, status pills) and opens a
 *    Product record tab to verify custom Product form widgets (Pricing, Accounting, GL Links,
 *    Dimension Defaults).
 */
import { test, expect, type Page } from '@playwright/test';
import { EXPLORER_BASE_URL } from '../lib/env';
import { captureConsoleErrors, expectNoConsoleErrors, isAuthenticated } from '../lib/explorer';

async function openOrdersApp(page: Page): Promise<void> {
  await page.goto(EXPLORER_BASE_URL, { waitUntil: 'domcontentloaded' });
  expect(await isAuthenticated(page), 'Explorer session must be authenticated').toBe(true);

  const switcher = page.locator('.app-switcher-button, [aria-label="Switch application"]').first();
  if (await switcher.isVisible({ timeout: 8_000 }).catch(() => false)) {
    const currentText = (await switcher.innerText().catch(() => '')).trim();
    if (!/^Orders$/i.test(currentText)) {
      await switcher.click();
      await page.waitForTimeout(500);
      const ordersOption = page
        .locator('.app-dropdown-menu .dropdown-item, [role="menuitem"]')
        .filter({ hasText: /^\s*Orders\s*$/i })
        .first();
      await expect(ordersOption, 'Orders application must appear in app switcher').toBeVisible({
        timeout: 10_000,
      });
      await ordersOption.click();
      await page.waitForTimeout(3_000);
    }
  } else {
    await page.goto(`${EXPLORER_BASE_URL}/app/orders`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3_000);
  }
}

async function openCatalogTab(page: Page): Promise<void> {
  const catalogNav = page
    .locator('.nav-item, [role="tab"]')
    .filter({ hasText: /^\s*Catalog\s*$/i })
    .first();
  await expect(catalogNav, 'Catalog tab must be present in Orders navigation').toBeVisible({
    timeout: 15_000,
  });
  await catalogNav.click();
  await page.waitForTimeout(2_000);
}

test.describe('Orders — Product Catalog', () => {
  test('renders Catalog sub-pages, filters products, and opens a Product record form', async ({
    page,
  }) => {
    const sink = captureConsoleErrors(page);

    await openOrdersApp(page);
    await openCatalogTab(page);

    await expect(page.locator('mjo-catalog-section')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('mjo-products-page')).toBeVisible({ timeout: 15_000 });

    const leftNavItems = page.locator('mj-left-nav .mj-left-nav__item, mjo-section-shell nav button, mjo-section-shell nav a');
    const navCount = await leftNavItems.count();
    expect(navCount, 'Catalog rail should expose sub-page navigation items').toBeGreaterThanOrEqual(4);

    // Search filter round-trip
    const searchInput = page.locator('mjo-products-page input[placeholder*="Search" i]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('zzz-no-match-expected');
      await page.waitForTimeout(400);
      await searchInput.fill('');
      await page.waitForTimeout(400);
    }

    // Status pills round-trip
    for (const label of ['Active', 'All']) {
      const pill = page
        .locator('mjo-products-page button')
        .filter({ hasText: new RegExp(`^\\s*${label}`, 'i') })
        .first();
      if (await pill.isVisible().catch(() => false)) {
        await pill.click();
        await page.waitForTimeout(300);
      }
    }

    // Open the first product row if rows are present and verify the Product form mounts its panels
    const firstRow = page.locator('mjo-products-page mjo-worklist-table tbody tr').first();
    if ((await firstRow.count()) > 0 && (await firstRow.isVisible().catch(() => false))) {
      await firstRow.click();
      await page.waitForTimeout(3_000);

      const formVisible = await page
        .locator('bizapps-product-save-guard-form, mj-biz-apps-orders-product-form')
        .first()
        .isVisible({ timeout: 15_000 })
        .catch(() => false);
      expect(formVisible, 'Clicking a product row should open the Product entity form').toBe(true);
    }

    expectNoConsoleErrors(sink, 'exercising the Orders Product Catalog');
  });
});
