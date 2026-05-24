import { useState } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { BellOffIcon } from './icons';

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="btn-icon relative"
      >
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
      </button>
      {open && (
        <div className="menu absolute right-0 mt-2 w-80 z-50">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Notifications</div>
            <button className="text-[11px] text-brand hover:underline">Mark all read</button>
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            <li className="px-4 py-10 text-sm text-slate-400 text-center">
              <BellOffIcon className="mx-auto mb-2 h-7 w-7 text-slate-300" />
              No new notifications
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
