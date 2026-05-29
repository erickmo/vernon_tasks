import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../../../api/client";
import { trackSprintBoardOpen, trackSprintTaskMoveMobile, trackSprintAxisToggle } from "../../../telemetry";

vi.mock("../../../api/client", () => ({ api: { post: vi.fn(() => Promise.resolve()) } }));

describe("mobile sprint telemetry", () => {
  beforeEach(() => vi.clearAllMocks());
  it("logs sprint_board_open with sprint", () => {
    trackSprintBoardOpen("SP-1");
    expect(api.post).toHaveBeenCalledWith("/api/method/vernon_tasks.task.api.telemetry.log_event", { event: "sprint_board_open", props: { sprint: "SP-1" } });
  });
  it("logs sprint_task_move with from/to/axis", () => {
    trackSprintTaskMoveMobile("Backlog", "In Progress", "kanban_status");
    expect(api.post).toHaveBeenCalledWith("/api/method/vernon_tasks.task.api.telemetry.log_event", { event: "sprint_task_move", props: { from: "Backlog", to: "In Progress", axis: "kanban_status" } });
  });
  it("logs sprint_axis_toggle with axis", () => {
    trackSprintAxisToggle("pdca_phase");
    expect(api.post).toHaveBeenCalledWith("/api/method/vernon_tasks.task.api.telemetry.log_event", { event: "sprint_axis_toggle", props: { axis: "pdca_phase" } });
  });
});
