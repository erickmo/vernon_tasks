import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterSheet } from "./FilterSheet";

const defaultInitial = { priority: [], project: "", due_range: "all" as const };

describe("FilterSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <FilterSheet open={false} initial={defaultInitial} onApply={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders filter heading when open", () => {
    render(
      <FilterSheet open initial={defaultInitial} onApply={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText("Filter")).toBeInTheDocument();
  });

  it("shows priority buttons", () => {
    render(
      <FilterSheet open initial={defaultInitial} onApply={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Tinggi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sedang" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rendah" })).toBeInTheDocument();
  });

  it("calls onApply with selected filters", () => {
    const onApply = vi.fn();
    render(
      <FilterSheet open initial={defaultInitial} onApply={onApply} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tinggi" }));
    fireEvent.click(screen.getByRole("button", { name: "Terapkan" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ priority: ["Tinggi"] }),
    );
  });

  it("reset clears priority selection", () => {
    const onApply = vi.fn();
    render(
      <FilterSheet open initial={{ priority: ["Tinggi"], due_range: "all" }} onApply={onApply} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Terapkan" }));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ priority: [] }),
    );
  });

  it("calls onCancel when backdrop clicked", () => {
    const onCancel = vi.fn();
    render(
      <FilterSheet open initial={defaultInitial} onApply={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onCancel).toHaveBeenCalled();
  });
});
