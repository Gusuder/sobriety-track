import { test, expect } from '@playwright/test';

test('forgot-password action becomes visible after failed login attempts', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route('**/api/auth/google/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: false, clientId: '' })
    });
  });
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Invalid credentials' })
    });
  });

  await page.goto('/');
  await page.click('button[onclick="openLoginPanel()"]');
  await expect(page.locator('#loginForm')).toBeVisible();

  for (let i = 0; i < 2; i += 1) {
    await page.fill('#login', 'demo_user');
    await page.fill('#password', 'wrong-pass-123');
    await page.click('#loginForm button[type="submit"]');
  }

  await expect(page.locator('#forgotHintWrap')).toBeVisible();
});

test('google oauth block shows unavailable message when oauth config is disabled', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    (window as any).google = {
      accounts: {
        id: {
          initialize: () => {},
          renderButton: () => {}
        }
      }
    };
  });
  await page.route('**/api/auth/google/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: false, clientId: '' })
    });
  });

  await page.goto('/');
  await page.click('button[onclick="openLoginPanel()"]');
  await expect(page.locator('#googleAuthWrapLogin .muted')).toBeVisible();
  await expect(page.locator('#googleAuthWrapLogin .muted')).toContainText('недоступен');
});

test('google oauth button renders when oauth config is enabled', async ({ page }) => {
  await page.route('https://accounts.google.com/gsi/client', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: ''
    });
  });
  await page.addInitScript(() => {
    localStorage.clear();
    (window as any).google = {
      accounts: {
        id: {
          initialize: () => {},
          renderButton: (container: HTMLElement) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.testid = 'google-mock-btn';
            btn.textContent = 'Google mock';
            btn.className = 'google-mock-btn';
            container.appendChild(btn);
          }
        }
      }
    };
  });
  await page.route('**/api/auth/google/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        enabled: true,
        clientId: '371943493630-8vgi8ab0au661m28bun0f4r81tsl9b3u.apps.googleusercontent.com'
      })
    });
  });

  await page.goto('/');
  await page.click('button[onclick="openLoginPanel()"]');
  await expect(page.locator('#googleAuthWrapLogin [data-testid="google-mock-btn"]')).toBeVisible();

  await page.click('#loginForm button[onclick="showAuthHome()"]');
  await page.click('button[onclick="openStartPanel()"]');
  await page.click('button[onclick="continueStartFlow()"]');
  await expect(page.locator('#registerForm')).toBeVisible();
  await expect(page.locator('#googleAuthWrapRegister [data-testid="google-mock-btn"]')).toBeVisible();
});
