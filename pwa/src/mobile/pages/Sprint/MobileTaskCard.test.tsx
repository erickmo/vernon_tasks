import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileTaskCard } from "./MobileTaskCard";
import type { TaskCardData } from "../../../portal/sprints/api/types";

const task: TaskCardData = { name: "T-1", title: "Ship login", assigned_to: "u@x", kanban_status: "Backlog", pdca_phase: "PLAN", kanban_rank: 1000, estimated_hours: 4, weight: 1, priority: "High", deadline: null };

describe("MobileTaskCard", () => {
  it("renders title, assignee, hours and priority class", () => {
    render(<MobileTaskCard task={task} />);
    expect(screen.getByText("Ship login")).toBeInTheDocument();
    expect(screen.getByText("u@x")).toBeInTheDocument();
    expect(screen.getByText("4h")).toBeInTheDocument();
    expect(screen.getByTestId("mtask-T-1").className).toContain("prio-high");
  });
  it("shows em dash when unassigned", () => {
    render(<MobileTaskCard task={{ ...task, assigned_to: null }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
  it("applies pending modifier when pending", () => {
    render(<MobileTaskCard task={task} pending />);
    expect(screen.getByTestId("mtask-T-1").className).toContain("m-task-card--pending");
  });
});
