import { useSession } from '@/features/auth/useSession';
import { logout } from '@/features/auth/loginApi';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { data: user } = useSession();
  const qc = useQueryClient();
  const nav = useNavigate();

  async function onLogout() {
    await logout();
    qc.clear();
    nav('/login', { replace: true });
  }

  return (
    <header className="h-12 flex items-center gap-3 px-4 border-b border-slate-200 dark:border-slate-800">
      <button
        onClick={onOpenPalette}
        className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label="Open command palette"
      >
        ⌘K
      </button>
      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        {user && (
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {user.full_name}
          </span>
        )}
        <button onClick={onLogout} className="text-xs underline">Sign out</button>
      </div>
    </header>
  );
}
