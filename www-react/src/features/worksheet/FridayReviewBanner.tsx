import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { bulkCarryOver, WORKSHEET_KEY } from './worksheetApi';
import { CalendarIcon } from '@/components/icons';

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
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-brand/20 bg-brand-subtle px-4 py-3 text-sm">
      <CalendarIcon className="h-4 w-4 text-brand" />
      <span className="font-medium text-slate-800">
        Wrap up the week — move incomplete tasks to next Monday?
      </span>
      <button
        onClick={() => m.mutate()}
        disabled={m.isPending}
        className="btn-primary btn-sm ml-auto"
      >
        {m.isPending ? 'Working…' : 'Carry over now'}
      </button>
    </div>
  );
}
