import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TopNav } from "./TopNav";

vi.mock("../hooks/useIsLeader", () => ({ useIsLeader: () => false }));
vi.mock("../hooks/useUnreadCount", () => ({
  useUnreadCount: () => ({ data: 0 }),
}));

function Wrapper({ path }: { path: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<TopNav />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TopNav", () => {
  it("renders Nav1 items for non-leader", () => {
    render(<Wrapper path="/m/dashboard" />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Me")).toBeInTheDocument();
  });

  it("hides Leader tab for non-leaders", () => {
    render(<Wrapper path="/m/dashboard" />);
    expect(screen.queryByText("Leader")).not.toBeInTheDocument();
  });

  it("shows Analytics Nav2 when analytics path is active", () => {
    render(<Wrapper path="/m/analytics" />);
    expect(screen.getByText("Leaderboard")).toBeInTheDocument();
    expect(screen.getByText("Velocity")).toBeInTheDocument();
    expect(screen.getByText("Streak")).toBeInTheDocument();
  });

  it("hides Nav2 when active page has no submenus", () => {
    render(<Wrapper path="/m/dashboard" />);
    expect(screen.queryByText("Leaderboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Velocity")).not.toBeInTheDocument();
  });

  it("shows Me Nav2 when me path is active", () => {
    render(<Wrapper path="/m/me" />);
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("Push Settings")).toBeInTheDocument();
  });
});

describe("TopNav (leader)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("shows Leader tab and its Nav2 items when useIsLeader returns true", async () => {
    vi.doMock("../hooks/useIsLeader", () => ({ useIsLeader: () => true }));
    vi.doMock("../hooks/useUnreadCount", () => ({
      useUnreadCount: () => ({ data: 0 }),
    }));
    const { TopNav: TopNavLeader } = await import("./TopNav");
    render(
      <MemoryRouter initialEntries={["/m/leader"]}>
        <Routes>
          <Route path="*" element={<TopNavLeader />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("Leader")).toBeInTheDocument();
    expect(screen.getByText("Review Queue")).toBeInTheDocument();
    expect(screen.getByText("Sprint")).toBeInTheDocument();
    expect(screen.getByText("Executive")).toBeInTheDocument();
  });
});
