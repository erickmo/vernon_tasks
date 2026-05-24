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
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center"
    >
      <div className="card w-full max-w-md p-6 space-y-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">
          Move {taskIds.length} tasks to sprint
        </h2>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="input"
        >
          <option value="">Select sprint…</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost btn-sm">
            Cancel
          </button>
          <button
            disabled={!target || m.isPending}
            onClick={() => m.mutate()}
            className="btn-primary btn-sm"
          >
            {m.isPending ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  );
}
