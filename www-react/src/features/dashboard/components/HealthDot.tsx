import clsx from 'clsx';
import type { HealthBucket } from '../types';

const COLOR: Record<HealthBucket, string> = {
  red: 'bg-risk-red',
  amber: 'bg-risk-amber',
  green: 'bg-risk-green',
  grey: 'bg-slate-400',
};

const LETTER: Record<HealthBucket, string> = {
  red: '!',
  amber: '·',
  green: '✓',
  grey: '?',
};

export function HealthDot({ bucket }: { bucket: HealthBucket }) {
  return (
    <span
      aria-label={`Health ${bucket}`}
      className={clsx(
        'inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold',
        COLOR[bucket],
      )}
    >
      {LETTER[bucket]}
    </span>
  );
}
