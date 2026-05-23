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
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
    >
      <div className="bg-white dark:bg-slate-900 p-6 rounded-lg w-96 space-y-4">
        <h2 className="font-semibold">Reassign {taskIds.length} tasks</h2>
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="w-full border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent"
        >
          <option value="">Select user…</option>
          {candidates.map((u) => (
            <option key={u.email} value={u.email}>
              {u.name}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm">
            Cancel
          </button>
          <button
            disabled={!owner || m.isPending}
            onClick={() => m.mutate()}
            className="text-sm bg-brand text-white px-3 py-1.5 rounded disabled:opacity-60"
          >
            {m.isPending ? 'Reassigning…' : 'Reassign'}
          </button>
        </div>
      </div>
    </div>
  );
}
