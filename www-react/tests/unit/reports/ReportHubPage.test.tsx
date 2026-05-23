import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { ReportHubPage } from '@/features/reports/ReportHubPage';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ReportHubPage', () => {
  let mock: MockAdapter;

  afterEach(() => {
    mock?.restore();
  });

  it('renders cards from API', async () => {
    mock = new MockAdapter(api);
    mock.onGet(/portal_reports\.list_reports/).reply(200, {
      message: [
        { slug: 'my-points', title: 'My Points & Performance', audience: [] },
        {
          slug: 'project-health',
          title: 'Project Health Heatmap',
          audience: ['Vernon Leader'],
        },
      ],
    });
    render(wrap(<ReportHubPage />));
    expect(
      await screen.findByText(/My Points & Performance/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Project Health Heatmap/)).toBeInTheDocument();
    expect(screen.getByText(/Vernon Leader/)).toBeInTheDocument();
    expect(screen.getByText(/All users/)).toBeInTheDocument();
  });

  it('shows empty state when no reports', async () => {
    mock = new MockAdapter(api);
    mock.onGet(/portal_reports\.list_reports/).reply(200, { message: [] });
    render(wrap(<ReportHubPage />));
    expect(
      await screen.findByText(/No reports available/i),
    ).toBeInTheDocument();
  });

  it('shows error state when API fails', async () => {
    mock = new MockAdapter(api);
    mock.onGet(/portal_reports\.list_reports/).reply(500);
    render(wrap(<ReportHubPage />));
    expect(
      await screen.findByText(/Failed to load reports/i),
    ).toBeInTheDocument();
  });
});
