import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LogProgressModal } from "./LogProgressModal";

describe("LogProgressModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <LogProgressModal open={false} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders heading when open", () => {
    render(<LogProgressModal open onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Catat progres")).toBeInTheDocument();
  });

  it("shows hours input with default value 1", () => {
    render(<LogProgressModal open onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe("1");
  });

  it("shows error when hours out of range", () => {
    const { container } = render(<LogProgressModal open onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "99" } });
    // Submit via form element directly to bypass browser constraint validation
    fireEvent.submit(container.querySelector("form")!);
    expect(screen.getByText("0.25–8")).toBeInTheDocument();
  });

  it("calls onSubmit with hours and trimmed note when valid", () => {
    const onSubmit = vi.fn();
    const { container } = render(<LogProgressModal open onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
    const textareas = screen.getAllByRole("textbox");
    fireEvent.change(textareas[0], { target: { value: "  done  " } });
    fireEvent.submit(container.querySelector("form")!);
    expect(onSubmit).toHaveBeenCalledWith(2, "done");
  });

  it("calls onCancel when backdrop clicked", () => {
    const onCancel = vi.fn();
    render(<LogProgressModal open onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onCancel on cancel button", () => {
    const onCancel = vi.fn();
    render(<LogProgressModal open onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
