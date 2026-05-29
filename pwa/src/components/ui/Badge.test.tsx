// pwa/src/components/ui/Badge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders dot variant with no text", () => {
    render(<Badge variant="dot" ariaLabel="unread" />);
    const el = screen.getByLabelText("unread");
    expect(el).toBeInTheDocument();
    expect(el.textContent).toBe("");
  });

  it("renders count", () => {
    render(<Badge variant="count" count={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("caps count at max with plus", () => {
    render(<Badge variant="count" count={150} max={99} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("returns null for count variant when count is 0", () => {
    const { container } = render(<Badge variant="count" count={0} />);
    expect(container.firstChild).toBeNull();
  });
});
