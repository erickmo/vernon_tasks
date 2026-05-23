import { test, expect } from '@playwright/test';

const initialPayload = {
  message: {
    week_start: '2026-05-18',
    week_end: '2026-05-24',
    capacity_hours: 40,
    days: Array.from({ length: 7 }, (_, i) => ({
      date: `2026-05-${String(18 + i).padStart(2, '0')}`,
      entries: [],
      scheduled_hours: 0,
    })),
    unscheduled: [
      {
        task_id: 'T1',
        title: 'Write spec',
        pdca: 'PLAN',
        points: 3,
        linked_kr: null,
        project: 'Alpha',
        due_date: null,
      },
    ],
  },
};

const afterSchedule = {
  message: {
    ...initialPayload.message,
    unscheduled: [],
    days: initialPayload.message.days.map((d, i) =>
      i === 0
        ? {
            ...d,
            entries: [
              {
                id: 'E1',
                task_id: 'T1',
                title: 'Write spec',
                pdca: 'PLAN',
                points: 3,
                linked_kr: null,
                project: 'Alpha',
                hour_start: 8,
                hours_planned: 1,
              },
            ],
            scheduled_hours: 1,
          }
        : d,
    ),
  },
};

test('drag unscheduled task into Monday', async ({ page, context }) => {
  let calls = 0;
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
        data: { name: 'u@v.id', full_name: 'U', user_image: null, language: 'en', roles: [] },
      }),
    }),
  );
  await context.route('**/portal_worksheet.get_worksheet**', (r) => {
    calls++;
    return r.fulfill({
      status: 200,
      body: JSON.stringify(calls === 1 ? initialPayload : afterSchedule),
    });
  });
  await context.route('**/portal_worksheet.schedule_task**', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify({ message: { entry_id: 'E1' } }) }),
  );

  await page.goto('/login');
  await page.getByLabel(/email/i).fill('u@v.id');
  await page.getByLabel(/password/i).fill('x');
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.goto('/portal/worksheet');
  const card = page.getByRole('button', { name: /write spec/i });
  await expect(card).toBeVisible();
  const target = page.locator('[data-day-date="2026-05-18"]').first();
  await card.dragTo(target);
  await expect(page.getByText(/write spec/i).first()).toBeVisible();
});
