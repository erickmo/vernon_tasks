import { ReactNode } from 'react';
import clsx from 'clsx';

type Tone = 'neutral' | 'positive' | 'warning' | 'danger';

const TONE_COLOR: Record<Tone, string> = {
  neutral: 'text-slate-900 dark:text-slate-100',
  positive: 'text-risk-green',
  warning: 'text-risk-amber',
  danger: 'text-risk-red',
};

export function MetricTile({
  label,
  value,
  hint,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
}) {
  const Wrap = onClick ? 'button' : 'div';
  return (
    <Wrap
      onClick={onClick}
      className={clsx(
        'text-left rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900',
        onClick && 'hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer',
      )}
    >
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={clsx('text-2xl font-semibold mt-1', TONE_COLOR[tone])}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </Wrap>
  );
}
