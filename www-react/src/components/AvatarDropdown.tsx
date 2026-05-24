import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth/useSession';
import { logout } from '@/features/auth/loginApi';
import { useClickOutside } from '@/hooks/useClickOutside';

export function AvatarDropdown() {
  const { data: user } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const qc = useQueryClient();
  const nav = useNavigate();

  const initials = user?.full_name
    ? user.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  async function onLogout() {
    try {
      await logout();
    } catch {
      // ignore — clearing cache + redirect is the safe end state
    } finally {
      qc.clear();
      nav('/login', { replace: true });
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-slate-100 transition"
      >
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand to-brand-hover text-white grid place-items-center text-xs font-semibold shadow-sm">
          {initials}
        </div>
        <span className="text-[13px] font-medium text-slate-700 hidden sm:inline max-w-[140px] truncate">
          {user?.full_name ?? ''}
        </span>
        <svg className="h-3 w-3 text-slate-400 hidden sm:block" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="m3 4.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="menu absolute right-0 mt-2 w-64 z-50">
          <div className="px-4 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-brand to-brand-hover text-white grid place-items-center text-sm font-semibold">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">{user?.full_name}</div>
              <div className="text-xs text-slate-500 truncate">{user?.name}</div>
            </div>
          </div>
          <ul className="py-1.5">
            <li>
              <button className="menu-item">
                <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
                Profile
              </button>
            </li>
            <li>
              <button className="menu-item">
                <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
                </svg>
                Settings
              </button>
            </li>
          </ul>
          <div className="border-t border-slate-100 py-1.5">
            <button onClick={onLogout} className="menu-item-danger">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
