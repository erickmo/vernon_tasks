import { test, expect } from '@playwright/test';

const listPayload = {
  message: [
    {
      id: 'P1',
      name: 'Alpha',
      health: 'green',
      percent_done: 0.5,
      days_left: 10,
      blocked_count: 0,
      owner: { id: 'u', name: 'U', avatar: null },
      current_sprint: null,
    },
  ],
};

const detailPayload = {
  message: {
    id: 'P1',
    title: 'Alpha',
    project_lead: 'u',
    health_score: 80,
    percent_done: 0.5,
    start_date: '2026-05-01',
    end_date: '2026-06-30',
    status: 'Active',
    active_sprint: { id: 'S1', name: 'Sprint 21', title: 'Sprint 21', days_left: 7 },
    linked_objective: 'O1',
    blocked_count: 0,
  },
};

const tasksKr = {
  message: [
    {
      key: 'KR1',
      label: 'Ship v2',
      meta: { target: 10, current: 3, progress: 0.3 },
      tasks: [
        {
          id: 't1',
          title: 'Design API',
          pdca: 'PLAN',
          assignee: 'a',
          due_date: null,
          points: 3,
          status: 'PLAN',
          linked_kr: 'KR1',
          sprint: null,
          risk_flag: null,
        },
      ],
    },
  ],
};

const tasksPdca = {
  message: [
    {
      key: 'PLAN',
      label: 'PLAN',
      meta: {},
      tasks: [
        {
          id: 't1',
          title: 'Design API',
          pdca: 'PLAN',
          assignee: 'a',
          due_date: null,
          points: 3,
          status: 'PLAN',
          linked_kr: 'KR1',
          sprint: null,
          risk_flag: null,
        },
      ],
    },
  ],
};

test('projects list → detail → tasks group toggle', async ({ page, context }) => {
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
  await context.route('**/portal_projects.list_projects**', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify(listPayload) }),
  );
  await context.route('**/portal_projects.get_project_detail**', (r) =>
    r.fulfill({ status: 200, body: JSON.stringify(detailPayload) }),
  );
  await context.route('**/portal_projects.get_project_tasks**', (r) => {
    const url = new URL(r.request().url());
    const body = url.searchParams.get('group_by') === 'pdca' ? tasksPdca : tasksKr;
    return r.fulfill({ status: 200, body: JSON.stringify(body) });
  });

  await page.goto('/login');
  await page.getByLabel(/email/i).fill('u@v.id');
  await page.getByLabel(/password/i).fill('x');
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.goto('/portal/projects');
  await expect(page.getByRole('link', { name: 'Alpha' })).toBeVisible();
  await page.getByRole('link', { name: 'Alpha' }).click();
  await expect(page.getByText('Ship v2')).toBeVisible();
  await page.getByRole('button', { name: /pdca/i }).click();
  await expect(page.getByText('PLAN').first()).toBeVisible();
});
