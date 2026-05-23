import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const commands = [
  { id: 'go-dashboard', label: 'Go to Dashboard', to: '/portal/dashboard' },
  { id: 'go-worksheet', label: 'Go to Worksheet', to: '/portal/worksheet' },
  { id: 'go-projects',  label: 'Go to Projects',  to: '/portal/projects' },
  { id: 'go-reports',   label: 'Go to Reports',   to: '/portal/reports' },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const nav = useNavigate();
  useEffect(() => { if (!open) setQ(''); }, [open]);
  if (!open) return null;
  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/40 flex items-start justify-center pt-32 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a command…"
          className="w-full px-4 py-3 bg-transparent border-b border-slate-200 dark:border-slate-800 outline-none"
        />
        <ul>
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => { nav(c.to); onClose(); }}
                className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
              >
                {c.label}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-500">No commands</li>
          )}
        </ul>
      </div>
    </div>
  );
}
