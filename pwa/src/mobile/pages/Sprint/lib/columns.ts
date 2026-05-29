/**
 * Column constants for the mobile sprint board.
 * Single source of the ordered column sets per board axis; reused by the
 * board page and the drag-end handler. Mirrors the desktop portal kanban.
 */
import type { KanbanStatus, PdcaPhase, BoardAxis } from "../../../../portal/sprints/api/types";

export const KANBAN_COLS: readonly KanbanStatus[] = [
  "Backlog",
  "Scheduled",
  "In Progress",
  "In Review",
  "Revision",
  "Done",
  "Blocked",
];

export const PDCA_COLS: readonly PdcaPhase[] = ["BACKLOG", "PLAN", "DO", "CHECK", "ACT", "DONE"];

/**
 * Return the ordered column set for the active board axis.
 * @param axis - kanban_status | pdca_phase
 * @returns readonly array of column values in display order
 */
export function columnsFor(axis: BoardAxis): readonly string[] {
  return axis === "kanban_status" ? KANBAN_COLS : PDCA_COLS;
}
