import { describe, it, expect, beforeEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { api } from '@/lib/api';
import { fetchSession, login, logout } from '@/features/auth/loginApi';

describe('session api', () => {
  let mock: MockAdapter;
  beforeEach(() => { mock = new MockAdapter(api); });

  it('login POSTs usr+pwd to /api/method/login', async () => {
    mock.onPost('/api/method/login').reply(200, { message: 'Logged In' });
    mock.onGet('/api/method/vernon_tasks.task.api.boot.boot').reply(200, {
      message: { user: 'mo@vernon.id', csrf_token: 'tok', roles: ['System Manager'] },
    });
    await login('mo@vernon.id', 'secret');
    expect(mock.history.post[0]?.data).toBe('usr=mo%40vernon.id&pwd=secret');
  });

  it('fetchSession returns FrappeUser from boot + user detail', async () => {
    mock.onGet('/api/method/vernon_tasks.task.api.boot.boot').reply(200, {
      message: { user: 'mo@vernon.id', csrf_token: 'tok', roles: ['System Manager'] },
    });
    mock.onGet('/api/resource/User/mo@vernon.id').reply(200, {
      data: { name: 'mo@vernon.id', full_name: 'Mo', user_image: null, language: 'id', roles: [{ role: 'System Manager' }] },
    });
    const user = await fetchSession();
    expect(user.full_name).toBe('Mo');
    expect(user.roles).toContain('System Manager');
  });

  it('logout POSTs to /api/method/logout', async () => {
    mock.onPost('/api/method/logout').reply(200);
    await logout();
    expect(mock.history.post.length).toBe(1);
  });
});
