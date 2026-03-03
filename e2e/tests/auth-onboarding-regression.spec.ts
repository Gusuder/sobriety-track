import { test, expect } from '@playwright/test';

test('failed login keeps user on auth screen and does not open onboarding', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Invalid credentials' })
    });
  });

  await page.goto('/');
  await expect(page.locator('#authShell')).toBeVisible();

  await page.fill('#login', 'demo_user');
  await page.fill('#password', 'wrong-pass-123');
  await page.locator('#loginForm button[type="submit"]').click();

  await expect(page.locator('#authError')).toBeVisible();
  await page.waitForTimeout(16_000);
  await expect(page.locator('#authShell')).toBeVisible();
  await expect(page.locator('#onboardingShell')).toBeHidden();
});

test('stale token and onboarding API failure returns to auth screen', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('token', 'stale-token'));

  await page.route('**/api/goals', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ activeGoal: null, progress: null })
    });
  });

  await page.route('**/api/onboarding', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' })
      });
      return;
    }
    await route.fallback();
  });

  await page.goto('/');
  await expect(page.locator('#authShell')).toBeVisible();
  await expect(page.locator('#onboardingShell')).toBeHidden();
});
