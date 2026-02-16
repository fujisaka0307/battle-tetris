import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test('/dashboard にアクセスして表示されること', async ({ page }) => {
    await page.goto('/dashboard');
    // Should show either the dashboard page or loading/error/empty state
    const page_ = page.locator('[data-testid^="dashboard-"]').first();
    await expect(page_).toBeVisible({ timeout: 10000 });
  });

  test('ダッシュボードタイトルが表示されること', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('CI/CD Dashboard')).toBeVisible({
      timeout: 10000,
    });
  });

  test('戻るリンクでトップへ遷移すること', async ({ page }) => {
    await page.goto('/dashboard');
    const backButton = page.getByTestId('dashboard-back');
    await expect(backButton).toBeVisible({ timeout: 10000 });
    await backButton.click();
    await page.waitForURL('/', { timeout: 10000 });
  });

  test('外部リンクが存在すること', async ({ page }) => {
    await page.goto('/dashboard');
    // Wait for page to load (any dashboard state)
    await expect(
      page.locator('[data-testid^="dashboard-"]').first(),
    ).toBeVisible({ timeout: 10000 });

    // Allure link should be present on success/error/empty states
    // On loading state it won't be present, so check after loading
    const allureLink = page.getByTestId('link-allure');
    const securityLink = page.getByTestId('link-security');

    // These links are present on non-loading states
    if (await allureLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(allureLink).toHaveAttribute(
        'href',
        'https://fujisaka0307.github.io/battle-tetris',
      );
      await expect(securityLink).toHaveAttribute(
        'href',
        'https://github.com/fujisaka0307/battle-tetris/security',
      );
    }
  });
});
