import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { login } from './loginApi';
import { useInvalidateSession } from './useSession';
import { env } from '@/lib/env';

export function LoginPage() {
  const [usr, setUsr] = useState('');
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const invalidate = useInvalidateSession();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(usr, pwd);
      await invalidate();
      const next = params.get('next') || '/portal/dashboard';
      nav(next, { replace: true });
    } catch {
      setErr('Invalid email or password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm bg-white dark:bg-slate-900 p-6 rounded-lg shadow border border-slate-200 dark:border-slate-800 space-y-4"
    >
      <h1 className="text-lg font-semibold">{env.APP_NAME}</h1>
      <div>
        <label htmlFor="usr" className="block text-sm font-medium">Email</label>
        <input id="usr" type="email" required value={usr} onChange={(e) => setUsr(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="pwd" className="block text-sm font-medium">Password</label>
        <input id="pwd" type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm" />
      </div>
      {err && <div role="alert" className="text-sm text-risk-red">{err}</div>}
      <button type="submit" disabled={busy}
        className="w-full rounded bg-brand text-white px-4 py-2 text-sm font-medium hover:bg-brand-hover disabled:opacity-60">
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
