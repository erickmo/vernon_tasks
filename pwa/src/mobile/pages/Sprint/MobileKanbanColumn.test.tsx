import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { MobileKanbanColumn } from "./MobileKanbanColumn";
import type { TaskCardData } from "../../../portal/sprints/api/types";

const tasks: TaskCardData[] = [
  { name: "T-1", title: "A", assigned_to: "u@x", kanban_status: "Backlog", pdca_phase: "PLAN", kanban_rank: 1000, estimated_hours: 2, weight: 1, priority: "Low", deadline: null },
  { name: "T-2", title: "B", assigned_to: "u@x", kanban_status: "Backlog", pdca_phase: "PLAN", kanban_rank: 2000, estimated_hours: 3, weight: 1, priority: "Medium", deadline: null },
];

describe("MobileKanbanColumn", () => {
  it("renders title, count and cards inside a DndContext", () => {
    render(<DndContext><MobileKanbanColumn column="Backlog" tasks={tasks} pendingTaskId={null} /></DndContext>);
    const col = screen.getByTestId("mcol-Backlog");
    expect(col).toHaveTextContent("Backlog");
    expect(col).toHaveTextContent("2");
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
