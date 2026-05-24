import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  addMonths,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const POPOVER_W = 288;
const POPOVER_H = 340;

function parseValue(v: string): Date | null {
  if (!v) return null;
  try {
    const d = parseISO(v);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = 'Pick a date',
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const selected = parseValue(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(selected ?? new Date());
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = r.left;
      if (left + POPOVER_W > vw - 8) left = Math.max(8, vw - POPOVER_W - 8);
      let top = r.bottom + 6;
      if (top + POPOVER_H > vh - 8) top = Math.max(8, r.top - POPOVER_H - 6);
      setPos({ top, left });
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const days = useMemo(() => {
    const start = startOfMonth(view);
    const end = endOfMonth(view);
    const leading = getDay(start);
    const cells: (Date | null)[] = [];
    for (let i = 0; i < leading; i++) cells.push(null);
    for (let d = 1; d <= end.getDate(); d++) {
      cells.push(new Date(view.getFullYear(), view.getMonth(), d));
    }
    return cells;
  }, [view]);

  function pick(d: Date) {
    onChange(format(d, 'yyyy-MM-dd'));
    setOpen(false);
  }

  const display = selected ? format(selected, 'd MMM yyyy') : '';

  const popover =
    open && pos ? (
      <div
        ref={popRef}
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: POPOVER_W,
          zIndex: 9999,
        }}
        className="menu p-3"
      >
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => setView((v) => subMonths(v, 1))}
            className="btn-icon h-7 w-7"
            aria-label="Previous month"
          >
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m7.5 3-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="text-sm font-semibold text-slate-700">
            {format(view, 'MMMM yyyy')}
          </div>
          <button
            type="button"
            onClick={() => setView((v) => addMonths(v, 1))}
            className="btn-icon h-7 w-7"
            aria-label="Next month"
          >
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m4.5 3 3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="text-[10px] uppercase tracking-wider text-slate-400 text-center py-1"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            if (!d) return <div key={`e-${i}`} />;
            const isSel = selected ? isSameDay(d, selected) : false;
            const isToday = isSameDay(d, new Date());
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => pick(d)}
                className={
                  'h-8 w-8 rounded-lg text-[13px] transition ' +
                  (isSel
                    ? 'bg-brand text-white font-semibold'
                    : isToday
                    ? 'text-brand font-semibold hover:bg-slate-100'
                    : 'text-slate-700 hover:bg-slate-100')
                }
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between mt-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => pick(new Date())}
            className="text-xs text-brand font-medium hover:underline"
          >
            Today
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex items-center justify-between text-left"
      >
        <span className={display ? 'text-slate-900' : 'text-slate-400'}>
          {display || placeholder}
        </span>
        <svg
          className="h-4 w-4 text-slate-400 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      </button>
      {popover && createPortal(popover, document.body)}
    </>
  );
}
