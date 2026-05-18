import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { ReportsPage } from "./ReportsPage";
import * as permsHook from "../../auth/usePermissions";

vi.mock("../../auth/usePermissions");
vi.mock("../../telemetry", () => ({
  trackReportsPageView: vi.fn(),
  trackReportsTabView: vi.fn(),
  trackReportsPermissionDenied: vi.fn(),
}));
// Lazy tab components — mock them to avoid recharts loading issues
vi.mock("./tabs/OkrTab", () => ({ OkrTab: () => createElement("div", null, "OKR Tab") }));
vi.mock("./tabs/SprintsTab", () => ({ SprintsTab: () => createElement("div", null, "Sprints Tab") }));
vi.mock("./tabs/TeamTab", () => ({ TeamTab: () => createElement("div", null, "Team Tab") }));

function renderPage(roles: string[]) {
  vi.mocked(permsHook.usePermissions).mockReturnValue({
    isLoading: false,
    permissions: [],
    roles,
    hasPermission: () => false,
    hasAnyPermission: () => false,
    hasRole: (r) => roles.includes(r),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(MemoryRouter, null, createElement(ReportsPage))
    )
  );
}

describe("ReportsPage tab visibility", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("Manager sees OKR, Sprints, and Team tabs", () => {
    renderPage(["VT Manager"]);
    expect(screen.getByRole("tab", { name: "OKR" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Sprints" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Team" })).toBeDefined();
  });

  it("Leader does NOT see OKR tab but sees Sprints and Team", () => {
    renderPage(["VT Leader"]);
    expect(screen.queryByRole("tab", { name: "OKR" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Sprints" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Team" })).toBeDefined();
  });

  it("Member with no matching roles sees PermissionDenied", () => {
    renderPage(["VT Member"]);
    expect(screen.getByText(/permission required/i)).toBeDefined();
  });
});
