export function BulkActionBar({
  count,
  onMoveSprint,
  onReassign,
  onPhaseShift,
  onClear,
}: {
  count: number;
  onMoveSprint: () => void;
  onReassign: () => void;
  onPhaseShift: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 bg-brand text-white px-4 py-2 rounded mb-3">
      <span className="text-sm">{count} selected</span>
      <button onClick={onMoveSprint} className="text-xs underline">
        Move sprint
      </button>
      <button onClick={onReassign} className="text-xs underline">
        Reassign
      </button>
      <button onClick={onPhaseShift} className="text-xs underline">
        Phase shift
      </button>
      <button onClick={onClear} className="ml-auto text-xs underline">
        Clear
      </button>
    </div>
  );
}
