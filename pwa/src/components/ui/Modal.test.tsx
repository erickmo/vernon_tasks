// pwa/src/components/ui/Modal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("does not render children when closed", () => {
    render(<Modal open={false} onClose={vi.fn()} variant="center"><p>hi</p></Modal>);
    expect(screen.queryByText("hi")).not.toBeInTheDocument();
  });

  it("renders dialog with role and aria-modal when open", () => {
    render(<Modal open onClose={vi.fn()} variant="center"><p>hi</p></Modal>);
    const dlg = screen.getByRole("dialog");
    expect(dlg).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} variant="center"><p>hi</p></Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on backdrop click", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} variant="center"><p>hi</p></Modal>);
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("ignores backdrop click when busy", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} variant="center" busy><p>hi</p></Modal>);
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves focus into the dialog on open", () => {
    render(<Modal open onClose={vi.fn()} variant="center"><button>act</button></Modal>);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("Tab from last focusable cycles to first", () => {
    render(
      <Modal open onClose={vi.fn()} variant="center">
        <button>first</button>
        <button>last</button>
      </Modal>,
    );
    const buttons = screen.getAllByRole("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(first);
  });

  it("Shift+Tab from first focusable cycles to last", () => {
    render(
      <Modal open onClose={vi.fn()} variant="center">
        <button>first</button>
        <button>last</button>
      </Modal>,
    );
    const buttons = screen.getAllByRole("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
