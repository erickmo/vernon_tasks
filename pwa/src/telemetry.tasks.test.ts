import { describe, it, expect, vi, beforeEach } from "vitest";
import * as telemetry from "./telemetry";

describe("tasks telemetry events", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("trackTaskDetailView", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackTaskDetailView("VT-TASK-1", "SP-1");
    expect(spy).toHaveBeenCalledWith("tasks.detail_view", { task: "VT-TASK-1", sprint: "SP-1" });
  });

  it("trackTaskUpdated", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackTaskUpdated("VT-TASK-1", ["title", "priority"]);
    expect(spy).toHaveBeenCalledWith("tasks.task_updated", { task: "VT-TASK-1", changed_fields: ["title", "priority"] });
  });

  it("trackTaskCreated", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackTaskCreated("VT-TASK-NEW", "SP-1", "PR-1");
    expect(spy).toHaveBeenCalledWith("tasks.task_created", { task: "VT-TASK-NEW", sprint: "SP-1", project: "PR-1" });
  });

  it("trackCommentAdded", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackCommentAdded("VT-TASK-1");
    expect(spy).toHaveBeenCalledWith("tasks.comment_added", { task: "VT-TASK-1" });
  });

  it("trackCommentDeleted", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackCommentDeleted("VT-TASK-1");
    expect(spy).toHaveBeenCalledWith("tasks.comment_deleted", { task: "VT-TASK-1" });
  });

  it("trackTaskPanelClosed", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackTaskPanelClosed("VT-TASK-1", 4200);
    expect(spy).toHaveBeenCalledWith("tasks.panel_closed", { task: "VT-TASK-1", open_duration_ms: 4200 });
  });
});
