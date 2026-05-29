import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MePage } from "./Me";

vi.mock("../../hooks/useUnreadCount", () => ({ useUnreadCount: vi.fn() }));
vi.mock("../../auth/session", () => ({
  probeSession: vi.fn().mockResolvedValue({ user: "test@example.com" }),
  logout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../components/PushToggle", () => ({
  PushToggle: () => <div data-testid="push-toggle" />,
}));

import { useUnreadCount } from "../../hooks/useUnreadCount";
const mockUnread = vi.mocked(useUnreadCount);

function renderMe() {
  return render(
    <MemoryRouter>
      <MePage />
    </MemoryRouter>
  );
}

describe("MePage", () => {
  it("renders notification link", () => {
    mockUnread.mockReturnValue({ data: 0 } as ReturnType<typeof useUnreadCount>);
    renderMe();
    expect(screen.getByRole("link", { name: /notif/i })).toBeInTheDocument();
  });

  it("renders unread Badge when count > 0", () => {
    mockUnread.mockReturnValue({ data: 5 } as ReturnType<typeof useUnreadCount>);
    renderMe();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("does not render badge when count is 0", () => {
    mockUnread.mockReturnValue({ data: 0 } as ReturnType<typeof useUnreadCount>);
    renderMe();
    expect(screen.queryByText("0")).toBeNull();
  });
});
