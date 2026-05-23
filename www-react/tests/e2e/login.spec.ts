import { test, expect } from '@playwright/test';

test('login redirects to dashboard placeholder', async ({ page, context }) => {
  await context.route('**/api/method/login', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ message: 'Logged In' }) }),
  );
  await context.route('**/api/method/frappe.auth.get_logged_user', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ message: 'mo@vernon.id' }) }),
  );
  await context.route('**/api/resource/User/**', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        data: { name: 'mo@vernon.id', full_name: 'Mo', user_image: null, language: 'id', roles: [] },
      }),
    }),
  );

  await page.goto('/login');
  await page.getByLabel(/email/i).fill('mo@vernon.id');
  await page.getByLabel(/password/i).fill('secret');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
