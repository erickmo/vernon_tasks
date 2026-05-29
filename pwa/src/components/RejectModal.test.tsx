import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RejectModal } from "./RejectModal";

describe("RejectModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <RejectModal open={false} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders heading when open", () => {
    render(<RejectModal open onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Alasan penolakan")).toBeInTheDocument();
  });

  it("shows textarea", () => {
    render(<RejectModal open onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("shows optional taskTitle", () => {
    render(<RejectModal open taskTitle="My Task" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("My Task")).toBeInTheDocument();
  });

  it("shows error when reason too short", () => {
    render(<RejectModal open onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: "Tolak" }));
    expect(screen.getByText("Minimal 5 karakter")).toBeInTheDocument();
  });

  it("calls onSubmit with trimmed reason when valid", () => {
    const onSubmit = vi.fn();
    render(<RejectModal open onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  reason enough  " } });
    fireEvent.click(screen.getByRole("button", { name: "Tolak" }));
    expect(onSubmit).toHaveBeenCalledWith("reason enough");
  });

  it("calls onCancel when backdrop clicked", () => {
    const onCancel = vi.fn();
    render(<RejectModal open onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onCancel on cancel button", () => {
    const onCancel = vi.fn();
    render(<RejectModal open onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
