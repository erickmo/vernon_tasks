import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { ProjectListPage } from '@/features/projects/ProjectListPage';

describe('ProjectListPage', () => {
  let mock: MockAdapter;
  beforeEach(() => {
    mock = new MockAdapter(api);
    // Reset persisted store between tests
    localStorage.clear();
  });

  it('renders rows from API', async () => {
    mock.onGet(/portal_projects\.list_projects/).reply(200, {
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
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ProjectListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
  });
});
