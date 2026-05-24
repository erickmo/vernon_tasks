import type { ReactNode } from 'react';

export function SectionHead({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
        {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
      </div>
      {action}
    </div>
  );
}
