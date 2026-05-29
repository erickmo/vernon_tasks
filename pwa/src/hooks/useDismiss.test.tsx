// pwa/src/hooks/useDismiss.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { useDismiss } from "./useDismiss";

function Harness({ onDismiss }: { onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onDismiss, true);
  return (
    <div>
      <div ref={ref} data-testid="inside">inside</div>
      <button data-testid="outside">outside</button>
    </div>
  );
}

describe("useDismiss", () => {
  it("calls handler on Escape", () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls handler on outside pointerdown", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
    fireEvent.pointerDown(getByTestId("outside"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does NOT call handler on inside pointerdown", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
    fireEvent.pointerDown(getByTestId("inside"));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does nothing when inactive", () => {
    const onDismiss = vi.fn();
    function Inactive() {
      const ref = useRef<HTMLDivElement>(null);
      useDismiss(ref, onDismiss, false);
      return <div ref={ref} />;
    }
    render(<Inactive />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
