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
    <div className="sticky top-0 z-10 mb-3 flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-hover px-4 py-2 text-white shadow-sm">
      <span className="text-sm font-medium">{count} selected</span>
      <div className="ml-2 flex items-center gap-1">
        <button
          onClick={onMoveSprint}
          className="h-8 rounded-full px-3 text-[13px] font-medium hover:bg-white/15"
        >
          Move sprint
        </button>
        <button
          onClick={onReassign}
          className="h-8 rounded-full px-3 text-[13px] font-medium hover:bg-white/15"
        >
          Reassign
        </button>
        <button
          onClick={onPhaseShift}
          className="h-8 rounded-full px-3 text-[13px] font-medium hover:bg-white/15"
        >
          Phase shift
        </button>
      </div>
      <button
        onClick={onClear}
        className="ml-auto h-8 rounded-full px-3 text-[13px] font-medium text-white/85 hover:bg-white/15"
      >
        Clear
      </button>
    </div>
  );
}
