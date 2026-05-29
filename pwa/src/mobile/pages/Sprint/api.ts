/**
 * Mobile sprint board API wrappers.
 * Thin re-exports of the portal sprint endpoints so endpoint paths and payload
 * assembly stay single-sourced (portal/sprints/api/sprints.ts). No new HTTP here.
 */
import {
  getSprintWithRelations,
  moveTask as portalMoveTask,
  rebalanceColumn as portalRebalanceColumn,
} from "../../../portal/sprints/api/sprints";
import type { SprintDetail, MoveTaskPayload, BoardAxis } from "../../../portal/sprints/api/types";

/**
 * Fetch a sprint with its tasks for the mobile board.
 * @param sprintId - sprint name
 */
export function getSprintBoard(sprintId: string): Promise<SprintDetail> {
  return getSprintWithRelations(sprintId);
}

/**
 * Move a task to a new column/rank. Delegates to the portal endpoint.
 * @param payload - task + axis field + kanban_rank
 */
export function moveTask(payload: MoveTaskPayload) {
  return portalMoveTask(payload);
}

/**
 * Rebalance ranks within a column when a collision occurs.
 * @param sprint - sprint name
 * @param axis - board axis
 * @param columnValue - column being rebalanced
 */
export function rebalanceColumn(sprint: string, axis: BoardAxis, columnValue: string) {
  return portalRebalanceColumn(sprint, axis, columnValue);
}
