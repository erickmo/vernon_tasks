import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskActions } from "./TaskActions";

describe("TaskActions", () => {
  it("buttons have >=44px min-height", () => {
    render(<TaskActions onComplete={vi.fn()} onLog={vi.fn()} onSnooze={vi.fn()} />);
    const btns = screen.getAllByRole("button");
    btns.forEach(b => expect(b).toHaveStyle({ minHeight: "44px" }));
  });
});
