import { ReactNode } from 'react';
import clsx from 'clsx';

type Tone = 'neutral' | 'positive' | 'warning' | 'danger';

const TONE_COLOR: Record<Tone, string> = {
  neutral: 'text-slate-900',
  positive: 'text-emerald-600',
  warning: 'text-amber-600',
  danger: 'text-rose-600',
};

const TONE_RING: Record<Tone, string> = {
  neutral: 'before:bg-slate-200',
  positive: 'before:bg-emerald-400',
  warning: 'before:bg-amber-400',
  danger: 'before:bg-rose-400',
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
        'relative text-left w-full p-5 overflow-hidden',
        'before:absolute before:left-0 before:top-4 before:bottom-4 before:w-[3px] before:rounded-r-full',
        TONE_RING[tone],
        onClick ? 'card-hover hover:-translate-y-0.5 cursor-pointer' : 'card',
      )}
    >
      <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-slate-500">{label}</div>
      <div className={clsx('text-[32px] leading-none font-bold mt-3 tracking-tight tabular-nums', TONE_COLOR[tone])}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-2">{hint}</div>}
    </Wrap>
  );
}
