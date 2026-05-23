import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

const sample = {
  message: {
    role: 'ic',
    at_risk: [],
    today: {
      ontime_rate_7d: 0.9,
      blocked_count: 0,
      okr_confidence_delta_wow: 0.02,
      next_deadline: null,
      pdca_queue: {},
    },
    me: { points_week: 12, streak_days: 3, capacity_used_pct: 0.6, ontime_rate_7d: 0.9 },
    sprints: [],
    projects: [],
  },
};

describe('DashboardPage', () => {
  let mock: MockAdapter;
  beforeEach(() => {
    mock = new MockAdapter(api);
  });

  it('renders Today and Me sections from payload', async () => {
    mock.onGet(/\/api\/method\/frappe\.auth\.get_logged_user/).reply(200, { message: 'u' });
    mock
      .onGet(/\/api\/resource\/User\//)
      .reply(200, { data: { name: 'u', full_name: 'U', roles: [] } });
    mock.onGet(/portal_dashboard\.get_home/).reply(200, sample);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/portal/dashboard']}>
          <Routes>
            <Route path="/portal/dashboard" element={<DashboardPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('region', { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /me/i })).toBeInTheDocument();
  });
});
