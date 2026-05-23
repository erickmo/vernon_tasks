import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { ProtectedRoute } from '@/components/ProtectedRoute';

function wrap(ui: React.ReactNode, route = '/portal/dashboard') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/login" element={<div>LOGIN</div>} />
          <Route path="/portal/*" element={<ProtectedRoute>{ui}</ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProtectedRoute', () => {
  it('renders children when session resolves', async () => {
    const mock = new MockAdapter(api);
    mock.onGet('/api/method/frappe.auth.get_logged_user').reply(200, { message: 'u' });
    mock.onGet(/\/api\/resource\/User\//).reply(200, { data: { name: 'u', full_name: 'U', roles: [] } });
    wrap(<div>SECRET</div>);
    expect(await screen.findByText('SECRET')).toBeInTheDocument();
  });

  it('redirects to /login on 401', async () => {
    const mock = new MockAdapter(api);
    mock.onGet('/api/method/frappe.auth.get_logged_user').reply(401);
    wrap(<div>SECRET</div>);
    expect(await screen.findByText('LOGIN')).toBeInTheDocument();
  });
});
