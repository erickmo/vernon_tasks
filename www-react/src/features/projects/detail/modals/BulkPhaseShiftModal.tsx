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
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
    >
      <div className="bg-white dark:bg-slate-900 p-6 rounded-lg w-96 space-y-4">
        <h2 className="font-semibold">Phase shift {taskIds.length} tasks</h2>
        <select
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
          className="w-full border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent"
        >
          <option value="">Select new phase…</option>
          {PHASES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm">
            Cancel
          </button>
          <button
            disabled={!phase || m.isPending}
            onClick={() => m.mutate()}
            className="text-sm bg-brand text-white px-3 py-1.5 rounded disabled:opacity-60"
          >
            {m.isPending ? 'Shifting…' : 'Shift'}
          </button>
        </div>
      </div>
    </div>
  );
}
