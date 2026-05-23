import { Outlet } from 'react-router-dom';

export function PortalShell() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4">
        <div className="font-semibold">Vernon</div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
