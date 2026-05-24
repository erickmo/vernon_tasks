import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bulkPhaseShift } from '../../projectsApi';

const PHASES = ['BACKLOG', 'PLAN', 'DO', 'CHECK', 'DONE', 'ACT'] as const;

export function BulkPhaseShiftModal({
  open,
  taskIds,
  onClose,
}: {
  open: boolean;
  taskIds: string[];
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<string>('');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => bulkPhaseShift(taskIds, phase),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
  });
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center"
    >
      <div className="card w-full max-w-md p-6 space-y-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">
          Phase shift {taskIds.length} tasks
        </h2>
        <select
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
          className="input"
        >
          <option value="">Select new phase…</option>
          {PHASES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost btn-sm">
            Cancel
          </button>
          <button
            disabled={!phase || m.isPending}
            onClick={() => m.mutate()}
            className="btn-primary btn-sm"
          >
            {m.isPending ? 'Shifting…' : 'Shift'}
          </button>
        </div>
      </div>
    </div>
  );
}
