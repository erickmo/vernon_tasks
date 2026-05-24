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
      await login(usr.trim(), pwd);
      await invalidate();
      const next = params.get('next') || '/portal/dashboard';
      nav(next, { replace: true });
    } catch {
      setErr('Email/username atau password salah');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="lg:hidden mb-8 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-brand text-white grid place-items-center font-bold">
          V
        </div>
        <span className="text-lg font-semibold">{env.APP_NAME}</span>
      </div>

      <div className="space-y-2 mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Selamat datang kembali
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Masuk untuk melanjutkan ke dashboard Vernon Tasks.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-xl shadow-slate-900/5 border border-slate-200/70 dark:border-slate-800"
      >
        <div className="space-y-1.5">
          <label htmlFor="usr" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Email atau Username
          </label>
          <input
            id="usr"
            name="username"
            type="text"
            autoComplete="username"
            autoFocus
            required
            value={usr}
            onChange={(e) => setUsr(e.target.value)}
            placeholder="nama.anda atau email@vernon.id"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="pwd" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Password
            </label>
          </div>
          <input
            id="pwd"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
          />
        </div>

        {err && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300"
          >
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand text-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {busy ? 'Memasukkan…' : 'Masuk'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-500">
        Butuh akses? Hubungi admin workspace Anda.
      </p>
    </div>
  );
}
