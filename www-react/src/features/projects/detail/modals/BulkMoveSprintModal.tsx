import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bulkMoveTasks } from '../../projectsApi';

export function BulkMoveSprintModal({
  open,
  taskIds,
  sprints,
  onClose,
}: {
  open: boolean;
  taskIds: string[];
  sprints: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [target, setTarget] = useState('');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => bulkMoveTasks(taskIds, target),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project'] });
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
        <h2 className="font-semibold">Move {taskIds.length} tasks to sprint</h2>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent"
        >
          <option value="">Select sprint…</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm">
            Cancel
          </button>
          <button
            disabled={!target || m.isPending}
            onClick={() => m.mutate()}
            className="text-sm bg-brand text-white px-3 py-1.5 rounded disabled:opacity-60"
          >
            {m.isPending ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  );
}
