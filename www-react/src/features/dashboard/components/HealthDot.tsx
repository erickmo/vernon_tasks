import clsx from 'clsx';
import type { ReactNode } from 'react';
import { CheckIcon } from '@/components/icons';
import type { HealthBucket } from '../types';

const COLOR: Record<HealthBucket, string> = {
  red: 'bg-risk-red',
  amber: 'bg-risk-amber',
  green: 'bg-risk-green',
  grey: 'bg-slate-400',
};

const GLYPH: Record<HealthBucket, ReactNode> = {
  red: '!',
  amber: '-',
  green: <CheckIcon className="h-3 w-3" strokeWidth={3} />,
  grey: '?',
};

export function HealthDot({ bucket }: { bucket: HealthBucket }) {
  return (
    <span
      aria-label={`Health ${bucket}`}
      className={clsx(
        'inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold shadow-sm shrink-0',
        COLOR[bucket],
      )}
    >
      {GLYPH[bucket]}
    </span>
  );
}
