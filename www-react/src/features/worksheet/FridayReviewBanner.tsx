import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { bulkCarryOver, WORKSHEET_KEY } from './worksheetApi';

const FRIDAY_DOW = 5;
const FRIDAY_AFTERNOON_HOUR = 15;

function isFridayAfternoon(): boolean {
  const d = new Date();
  return d.getDay() === FRIDAY_DOW && d.getHours() >= FRIDAY_AFTERNOON_HOUR;
}

export function FridayReviewBanner({ weekStart }: { weekStart: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => bulkCarryOver(weekStart),
    onSuccess: (moved) => {
      toast.success(`Carried over ${moved} tasks to next week`);
      qc.invalidateQueries({ queryKey: WORKSHEET_KEY(weekStart) });
    },
  });
  if (!isFridayAfternoon()) return null;
  return (
    <div className="rounded border border-brand/40 bg-brand-subtle px-4 py-2 mb-3 flex items-center gap-3 text-sm">
      <span>Wrap up the week: move incomplete tasks to next Monday?</span>
      <button
        onClick={() => m.mutate()}
        disabled={m.isPending}
        className="ml-auto text-xs bg-brand text-white px-3 py-1 rounded"
      >
        {m.isPending ? 'Working…' : 'Carry over now'}
      </button>
    </div>
  );
}
