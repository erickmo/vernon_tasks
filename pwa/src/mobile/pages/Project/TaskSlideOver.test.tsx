import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskSlideOver } from "./TaskSlideOver";
import type { ProjectTask } from "./api";

const task: ProjectTask = {
  name: "VT-001", title: "Test Task", assigned_to: "a@x.com",
  deadline: "2026-06-01", priority: "High", pdca_phase: "Do",
  kanban_status: "Open", base_points: 10, completion_date: null,
};

describe("TaskSlideOver", () => {
  it("renders task title in view mode", () => {
    render(<TaskSlideOver task={task} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("Test Task")).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    render(<TaskSlideOver task={task} open={false} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByText("Test Task")).not.toBeInTheDocument();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(<TaskSlideOver task={task} open onClose={onClose} onSave={vi.fn()} />);
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("switches to edit mode on Edit button click", () => {
    render(<TaskSlideOver task={task} open onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByLabelText(/judul/i)).toBeInTheDocument();
  });

  it("calls onSave with updated values on submit", () => {
    const onSave = vi.fn();
    render(<TaskSlideOver task={task} open onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    const titleInput = screen.getByLabelText(/judul/i);
    fireEvent.change(titleInput, { target: { value: "Updated Title" } });
    fireEvent.click(screen.getByRole("button", { name: /simpan/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: "VT-001", title: "Updated Title" }),
    );
  });
});
