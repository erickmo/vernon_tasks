import { Outlet } from 'react-router-dom';
import { env } from '@/lib/env';

export function AuthLayout() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50 dark:bg-slate-950">
      <aside
        className="relative hidden lg:flex flex-col justify-between p-12 text-white overflow-hidden"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.12), transparent 45%), linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #2563eb 100%)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-white/15 backdrop-blur-sm grid place-items-center font-bold text-lg">
            V
          </div>
          <span className="text-lg font-semibold tracking-tight">{env.APP_NAME}</span>
        </div>
        <div className="relative z-10 space-y-6">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">
            Kelola sasaran tim<br />tanpa gesekan.
          </h2>
          <p className="text-base text-blue-100/90 max-w-md">
            Satu tempat untuk OKR, proyek, dan worksheet mingguan. Tetap selaras lintas tim,
            tanpa rapat berulang.
          </p>
          <ul className="space-y-3 text-sm text-blue-100/90">
            <li className="flex items-center gap-2"><Dot /> OKR tracking real-time</li>
            <li className="flex items-center gap-2"><Dot /> Worksheet mingguan otomatis</li>
            <li className="flex items-center gap-2"><Dot /> Laporan eksekutif siap-share</li>
          </ul>
        </div>
        <div className="relative z-10 text-xs text-blue-100/70">
          © {new Date().getFullYear()} Vernon Corp.
        </div>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-10">
        <Outlet />
      </main>
    </div>
  );
}

function Dot() {
  return (
    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
  );
}
