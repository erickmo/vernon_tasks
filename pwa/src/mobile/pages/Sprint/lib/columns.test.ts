import { describe, it, expect } from "vitest";
import { KANBAN_COLS, PDCA_COLS, columnsFor } from "./columns";

describe("sprint columns", () => {
  it("kanban has 7 statuses in order", () => {
    expect(KANBAN_COLS).toEqual(["Backlog", "Scheduled", "In Progress", "In Review", "Revision", "Done", "Blocked"]);
  });
  it("pdca has 6 phases in order", () => {
    expect(PDCA_COLS).toEqual(["BACKLOG", "PLAN", "DO", "CHECK", "ACT", "DONE"]);
  });
  it("columnsFor returns the right set per axis", () => {
    expect(columnsFor("kanban_status")).toBe(KANBAN_COLS);
    expect(columnsFor("pdca_phase")).toBe(PDCA_COLS);
  });
});
