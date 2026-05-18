import { describe, it, expect, vi, beforeEach } from "vitest";
import * as telemetry from "./telemetry";

describe("sprints telemetry events", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("trackSprintBoardView", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackSprintBoardView("PR-1", 3);
    expect(spy).toHaveBeenCalledWith("sprints.board_view", { project: "PR-1", sprint_count: 3 });
  });
  it("trackSprintMove", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackSprintMove("SP-1", "Planning", "Active");
    expect(spy).toHaveBeenCalledWith("sprints.sprint_move", { sprint: "SP-1", from_status: "Planning", to_status: "Active" });
  });
  it("trackTaskMove", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackTaskMove("T-1", "SP-1", "kanban", "Backlog", "In Progress");
    expect(spy).toHaveBeenCalledWith("sprints.task_move", { task: "T-1", sprint: "SP-1", axis: "kanban", from: "Backlog", to: "In Progress" });
  });
  it("trackBurndownView", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackBurndownView("SP-1");
    expect(spy).toHaveBeenCalledWith("sprints.burndown_view", { sprint: "SP-1" });
  });
  it("trackSprintCreated", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackSprintCreated("SP-1", "PR-1");
    expect(spy).toHaveBeenCalledWith("sprints.sprint_created", { sprint: "SP-1", project: "PR-1" });
  });
  it("trackTaskBoardAxisToggle", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackTaskBoardAxisToggle("SP-1", "pdca");
    expect(spy).toHaveBeenCalledWith("sprints.task_board_axis_toggle", { sprint: "SP-1", axis: "pdca" });
  });
});
