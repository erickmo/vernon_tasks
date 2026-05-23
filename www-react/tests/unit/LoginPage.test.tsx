import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { LoginPage } from '@/features/auth/LoginPage';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/login?next=/portal/projects']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/portal/projects" element={<div>PROJECTS</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  let mock: MockAdapter;
  beforeEach(() => { mock = new MockAdapter(api); });

  it('submits credentials and navigates to next param', async () => {
    mock.onPost('/api/method/login').reply(200, { message: 'Logged In' });
    mock.onGet('/api/method/frappe.auth.get_logged_user').reply(200, { message: 'mo' });
    mock.onGet(/\/api\/resource\/User\//).reply(200, { data: { name: 'mo', full_name: 'Mo', roles: [] } });

    setup();
    await userEvent.type(screen.getByLabelText(/email/i), 'mo@vernon.id');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('PROJECTS')).toBeInTheDocument();
  });

  it('shows error on invalid creds', async () => {
    mock.onPost('/api/method/login').reply(401, { message: 'Invalid' });
    setup();
    await userEvent.type(screen.getByLabelText(/email/i), 'x@y.z');
    await userEvent.type(screen.getByLabelText(/password/i), 'bad');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid/i);
  });
});
