import { useMutation, useQueryClient } from "@tanstack/react-query";
import { moveTask, rebalanceColumn } from "../api/sprints";
import type { SprintDetail, TaskCardData, BoardAxis } from "../api/types";
import { computeRank, needsRebalance } from "../lib/rank";

export function useTaskBoard(sprintId: string) {
  const qc = useQueryClient();
  const key = ["sprintDetail", sprintId];

  const move = useMutation({
    mutationFn: async (args: {
      task: string; axis: BoardAxis; targetColumn: string; prevRank: number | null; nextRank: number | null;
    }) => {
      const newRank = computeRank(args.prevRank, args.nextRank);
      const prev = qc.getQueryData<SprintDetail>(key);
      if (prev) {
        const tasks: TaskCardData[] = prev.tasks.map(t =>
          t.name === args.task ? { ...t, [args.axis]: args.targetColumn, kanban_rank: newRank } as TaskCardData : t
        );
        qc.setQueryData<SprintDetail>(key, { ...prev, tasks });
      }
      try {
        const payload: Record<string, unknown> = { task: args.task, kanban_rank: newRank };
        payload[args.axis] = args.targetColumn;
        const res = await moveTask(payload as unknown as Parameters<typeof moveTask>[0]);
        if (args.prevRank != null && needsRebalance(args.prevRank, newRank)) {
          await rebalanceColumn(sprintId, args.axis, args.targetColumn);
          await qc.invalidateQueries({ queryKey: key });
        }
        return res;
      } catch (e) {
        if (prev) qc.setQueryData(key, prev);
        throw e;
      }
    },
  });

  return { move };
}
