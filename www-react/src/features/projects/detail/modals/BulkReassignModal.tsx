import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bulkReassign } from '../../projectsApi';

export function BulkReassignModal({
  open,
  taskIds,
  candidates,
  onClose,
}: {
  open: boolean;
  taskIds: string[];
  candidates: { email: string; name: string }[];
  onClose: () => void;
}) {
  const [owner, setOwner] = useState('');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => bulkReassign(taskIds, owner),
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
          Reassign {taskIds.length} tasks
        </h2>
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="input"
        >
          <option value="">Select user…</option>
          {candidates.map((u) => (
            <option key={u.email} value={u.email}>
              {u.name}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost btn-sm">
            Cancel
          </button>
          <button
            disabled={!owner || m.isPending}
            onClick={() => m.mutate()}
            className="btn-primary btn-sm"
          >
            {m.isPending ? 'Reassigning…' : 'Reassign'}
          </button>
        </div>
      </div>
    </div>
  );
}
