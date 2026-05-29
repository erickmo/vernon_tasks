import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BottomNav } from "./BottomNav";

vi.mock("../hooks/useUnreadCount", () => ({ useUnreadCount: vi.fn() }));
vi.mock("../hooks/useIsLeader", () => ({ useIsLeader: () => false }));

import { useUnreadCount } from "../hooks/useUnreadCount";
const mockUnread = vi.mocked(useUnreadCount);

describe("BottomNav", () => {
  it("renders nav links with >=48px min-height and 12px font", () => {
    mockUnread.mockReturnValue({ data: 0 } as ReturnType<typeof useUnreadCount>);
    render(<MemoryRouter><BottomNav /></MemoryRouter>);
    const link = screen.getByRole("link", { name: /dashboard/i });
    expect(link).toHaveStyle({ minHeight: "48px" });
    expect(link).toHaveStyle({ fontSize: "12px" });
  });

  it("renders unread dot badge on me tab when unread > 0", () => {
    mockUnread.mockReturnValue({ data: 3 } as ReturnType<typeof useUnreadCount>);
    render(<MemoryRouter><BottomNav /></MemoryRouter>);
    expect(screen.getByLabelText(/unread/i)).toBeInTheDocument();
  });
});
