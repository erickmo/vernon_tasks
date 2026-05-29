import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BottomNav } from "./BottomNav";

vi.mock("../hooks/useUnreadCount", () => ({ useUnreadCount: () => ({ data: 0 }) }));
vi.mock("../hooks/useIsLeader", () => ({ useIsLeader: () => false }));

describe("BottomNav", () => {
  it("renders nav links with >=48px min-height and 12px font", () => {
    render(<MemoryRouter><BottomNav /></MemoryRouter>);
    const link = screen.getByRole("link", { name: /dashboard/i });
    expect(link).toHaveStyle({ minHeight: "48px" });
    expect(link).toHaveStyle({ fontSize: "12px" });
  });
});
