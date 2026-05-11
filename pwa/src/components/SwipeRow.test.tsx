import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwipeRow } from "./SwipeRow";

describe("SwipeRow", () => {
  it("renders children + actions", () => {
    render(
      <SwipeRow actions={<button data-testid="act">A</button>}>
        <span>row</span>
      </SwipeRow>,
    );
    expect(screen.getByText("row")).toBeInTheDocument();
    expect(screen.getByTestId("act")).toBeInTheDocument();
  });

  it("reveals after pan past threshold", () => {
    const { container } = render(
      <SwipeRow actions={<button>A</button>}>
        <span>row</span>
      </SwipeRow>,
    );
    const wrapper = container.querySelector("[data-revealed]")!;
    const pannable = wrapper.querySelectorAll("div")[1] as HTMLElement;
    fireEvent.pointerDown(pannable, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(pannable, { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(pannable, { clientX: 200, pointerId: 1 });
    expect(wrapper.getAttribute("data-revealed")).toBe("true");
  });

  it("snaps back if released under threshold", () => {
    const { container } = render(
      <SwipeRow actions={<button>A</button>}>
        <span>row</span>
      </SwipeRow>,
    );
    const wrapper = container.querySelector("[data-revealed]")!;
    const pannable = wrapper.querySelectorAll("div")[1] as HTMLElement;
    fireEvent.pointerDown(pannable, { clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(pannable, { clientX: 280, pointerId: 1 });
    fireEvent.pointerUp(pannable, { clientX: 280, pointerId: 1 });
    expect(wrapper.getAttribute("data-revealed")).toBe("false");
  });
});
