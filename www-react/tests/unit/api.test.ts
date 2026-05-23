import { describe, it, expect, vi, beforeEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { api, onUnauthorized } from '@/lib/api';

describe('api client', () => {
  let mock: MockAdapter;
  beforeEach(() => {
    mock = new MockAdapter(api);
  });

  it('sends credentials with every request', () => {
    expect(api.defaults.withCredentials).toBe(true);
  });

  it('calls onUnauthorized handler on 401', async () => {
    const spy = vi.fn();
    onUnauthorized(spy);
    mock.onGet('/api/method/ping').reply(401);
    await expect(api.get('/api/method/ping')).rejects.toThrow();
    expect(spy).toHaveBeenCalledOnce();
  });
});
