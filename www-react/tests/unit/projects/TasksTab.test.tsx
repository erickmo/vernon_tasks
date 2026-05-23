import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { TasksTab } from '@/features/projects/detail/tabs/TasksTab';

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/portal/projects/P1/tasks']}>
        <Routes>
          <Route path="/portal/projects/:id/tasks" element={<TasksTab />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TasksTab', () => {
  let mock: MockAdapter;
  beforeEach(() => {
    mock = new MockAdapter(api);
    localStorage.clear();
  });

  it('defaults to KR grouping and renders buckets', async () => {
    mock.onGet(/get_project_tasks/).reply(200, {
      message: [
        {
          key: 'KR1',
          label: 'Ship v2',
          meta: { target: 100, current: 30, progress: 0.3 },
          tasks: [
            {
              id: 't1',
              title: 'Design API',
              pdca: 'PLAN',
              assignee: 'a@v',
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
    });
    wrap();
    expect(await screen.findByText('Ship v2')).toBeInTheDocument();
    expect(screen.getByText('Design API')).toBeInTheDocument();
    const last = mock.history.get.at(-1);
    expect(last!.params.group_by).toBe('kr');
  });

  it('refetches with new group when toggle clicked', async () => {
    mock.onGet(/get_project_tasks/).reply(200, { message: [] });
    wrap();
    await screen.findByText(/group by/i);
    await userEvent.click(screen.getByRole('button', { name: /pdca/i }));
    await waitFor(() => {
      const last = mock.history.get.at(-1);
      expect(last!.params.group_by).toBe('pdca');
    });
  });
});
