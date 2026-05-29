import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../../../api/client";
import { getSprintBoard, moveTask, rebalanceColumn } from "./api";

vi.mock("../../../api/client", () => ({ api: { get: vi.fn(() => Promise.resolve({})), post: vi.fn(() => Promise.resolve({})) } }));

describe("mobile sprint api", () => {
  beforeEach(() => vi.clearAllMocks());
  it("getSprintBoard hits get_sprint_with_relations with name", async () => {
    await getSprintBoard("SP-1");
    expect(api.get).toHaveBeenCalledWith("/api/method/vernon_tasks.api.sprints.get_sprint_with_relations", { name: "SP-1" });
  });
  it("moveTask posts move_task with axis field + rank", async () => {
    await moveTask({ task: "T-1", kanban_status: "In Progress", kanban_rank: 1500 });
    expect(api.post).toHaveBeenCalledWith("/api/method/vernon_tasks.api.sprints.move_task", { task: "T-1", kanban_status: "In Progress", kanban_rank: 1500 });
  });
  it("rebalanceColumn posts rebalance_column with column_value", async () => {
    await rebalanceColumn("SP-1", "kanban_status", "Done");
    expect(api.post).toHaveBeenCalledWith("/api/method/vernon_tasks.api.sprints.rebalance_column", { sprint: "SP-1", axis: "kanban_status", column_value: "Done" });
  });
});
