import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskCard } from "./TaskCard";
import type { TaskCardData } from "./api/types";

const t: TaskCardData = {
  name: "T-1", title: "Implement burndown", assigned_to: "alice@x", kanban_status: "In Progress",
  pdca_phase: "DO", kanban_rank: 1000, estimated_hours: 4, weight: 1, priority: "High", deadline: "2026-05-31",
};

describe("TaskCard", () => {
  it("renders title + assignee + hours", () => {
    render(<TaskCard task={t} draggable />);
    expect(screen.getByText("Implement burndown")).toBeInTheDocument();
    expect(screen.getByText(/alice@x/)).toBeInTheDocument();
    expect(screen.getByText(/4h/)).toBeInTheDocument();
  });
  it("shows muted state when not draggable", () => {
    const { container } = render(<TaskCard task={t} draggable={false} />);
    expect(container.querySelector(".task-card--muted")).not.toBeNull();
  });

  it("calls onTaskOpen with task name on click", () => {
    const onTaskOpen = vi.fn();
    const task: TaskCardData = {
      name: "VT-TASK-7",
      title: "Clickable",
      assigned_to: null,
      kanban_status: "Backlog",
      pdca_phase: "BACKLOG",
      kanban_rank: 1000,
      estimated_hours: 2,
      weight: 1,
      priority: "Medium",
      deadline: null,
    };
    render(<TaskCard task={task} draggable={false} onTaskOpen={onTaskOpen} />);
    fireEvent.click(screen.getByText("Clickable"));
    expect(onTaskOpen).toHaveBeenCalledWith("VT-TASK-7");
  });
});
