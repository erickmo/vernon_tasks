import { test, expect } from '@playwright/test';

const listPayload = {
  message: [
    { slug: 'my-points', title: 'My Points', audience: [] },
  ],
};

const runPayload = {
  message: {
    slug: 'my-points',
    title: 'My Points',
    columns: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'points', label: 'Points', type: 'number' },
    ],
    rows: [{ date: '2026-05-22', points: 5 }],
    viz: { type: 'line' },
    narrative: ['Total 5 points'],
  },
};

test('reports hub → run → CSV export', async ({ page, context }) => {
  await context.route('**/api/method/login', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ message: 'Logged In' }) }),
  );
  await context.route('**/api/method/frappe.auth.get_logged_user', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ message: 'u@v.id' }) }),
  );
  await context.route('**/api/resource/User/**', (r) =>
    r.fulfill({
      status: 200,
      body: JSON.stringify({
        data: {
          name: 'u@v.id',
          full_name: 'U',
          user_image: null,
          language: 'en',
          roles: [],
        },
      }),
    }),
  );
  await context.route(/portal_reports\.list_reports/, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(listPayload),
    }),
  );
  await context.route(/portal_reports\.run_report/, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(runPayload),
    }),
  );

  let exportCalled = false;
  await context.route(/portal_reports\.export/, (r) => {
    exportCalled = true;
    return r.fulfill({
      status: 200,
      contentType: 'text/csv',
      headers: { 'content-disposition': 'attachment; filename="my-points.csv"' },
      body: 'Date,Points\n2026-05-22,5\n',
    });
  });

  await page.goto('/login');
  await page.getByLabel(/email/i).fill('u@v.id');
  await page.getByLabel(/password/i).fill('x');
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.goto('/portal/reports');
  await expect(page.getByRole('link', { name: /my points/i })).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole('link', { name: /my points/i }).click();

  await expect(page.getByText(/Total 5 points/i)).toBeVisible();
  await expect(
    page.getByRole('cell', { name: '2026-05-22' }),
  ).toBeVisible();

  await page.getByRole('button', { name: /^csv$/i }).click();
  await expect.poll(() => exportCalled).toBe(true);
});
