/**
 * useSprintBoard — react-query data + optimistic move mutation for the mobile
 * sprint board. Mirrors the portal useTaskBoard optimistic pattern: snapshot,
 * optimistic setQueryData, on error rollback + rethrow. Reuses portal rank math.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSprintBoard, moveTask, rebalanceColumn } from "../api";
import type {
  SprintDetail,
  TaskCardData,
  BoardAxis,
  MoveTaskPayload,
  KanbanStatus,
  PdcaPhase,
} from "../../../../portal/sprints/api/types";
import { computeRank, needsRebalance } from "../../../../portal/sprints/lib/rank";

/** Arguments describing a single drag-to-move on the board. */
export interface MoveArgs {
  task: string;
  axis: BoardAxis;
  targetColumn: string;
  prevRank: number | null;
  nextRank: number | null;
}

/**
 * Load a sprint board and expose an optimistic move mutation.
 * @param sprintId - sprint name
 * @returns react-query result spread + `move` mutation
 */
export function useSprintBoard(sprintId: string) {
  const qc = useQueryClient();
  const key = ["mobileSprintBoard", sprintId];
  const query = useQuery({ queryKey: key, queryFn: () => getSprintBoard(sprintId), enabled: !!sprintId });

  const move = useMutation({
    mutationFn: async (args: MoveArgs) => {
      const newRank = computeRank(args.prevRank, args.nextRank);
      const prev = qc.getQueryData<SprintDetail>(key);
      // Optimistically reflect the move in the cache before the request resolves.
      if (prev) {
        const tasks: TaskCardData[] = prev.tasks.map((t) =>
          t.name === args.task ? ({ ...t, [args.axis]: args.targetColumn, kanban_rank: newRank } as TaskCardData) : t,
        );
        qc.setQueryData<SprintDetail>(key, { ...prev, tasks });
      }
      try {
        // Explicit narrowing keeps the payload typed without `as never`.
        const payload: MoveTaskPayload = { task: args.task, kanban_rank: newRank };
        if (args.axis === "kanban_status") payload.kanban_status = args.targetColumn as KanbanStatus;
        else payload.pdca_phase = args.targetColumn as PdcaPhase;
        const res = await moveTask(payload);
        // Fractional ranks can collide; rebalance the destination column when they do.
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

  return { ...query, move };
}
