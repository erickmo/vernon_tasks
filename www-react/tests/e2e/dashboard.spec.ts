import { test, expect } from '@playwright/test';

const payload = {
  message: {
    role: 'ic',
    at_risk: [
      { project_id: 'p1', project_name: 'Alpha', reason: 'health -12 WoW', severity: 'high' },
    ],
    today: {
      ontime_rate_7d: 0.84,
      blocked_count: 3,
      okr_confidence_delta_wow: -0.05,
      next_deadline: null,
      pdca_queue: {},
    },
    me: { points_week: 18, streak_days: 4, capacity_used_pct: 0.7, ontime_rate_7d: 0.84 },
    sprints: [
      { id: 's1', name: 'Sprint 21', days_left: 4, percent_done: 0.6, burndown_spark: [10, 8, 6, 5, 3] },
    ],
    projects: [
      { id: 'p1', name: 'Alpha', health: 'amber', okr_progress: 0.45, my_role: 'lead', blocked_count: 2, days_left: 12 },
    ],
  },
};

test('dashboard renders banner + tiles + sprints + projects', async ({ page, context }) => {
  await context.route('**/api/method/login', (r) =>
    r.fulfill({ status: 200, body: '{"message":"ok"}' }),
  );
  await context.route('**/api/method/frappe.auth.get_logged_user', (r) =>
    r.fulfill({ status: 200, body: '{"message":"u"}' }),
  );
  await context.route('**/api/resource/User/**', (r) =>
    r.fulfill({
      status: 200,
      body: '{"data":{"name":"u","full_name":"U","roles":[]}}',
    }),
  );
  await context.route('**/portal_dashboard.get_home**', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify(payload) }),
  );

  await page.goto('/login');
  await page.getByLabel(/email/i).fill('u@v.id');
  await page.getByLabel(/password/i).fill('x');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByRole('alert')).toContainText(/1 project at risk/i);
  await expect(page.getByRole('region', { name: /today/i })).toBeVisible();
  await expect(page.getByText('Sprint 21')).toBeVisible();
  await expect(page.getByText('Alpha')).toBeVisible();
});
