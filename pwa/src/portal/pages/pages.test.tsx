import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { NotFound } from "./NotFound";
import { ErrorPage } from "./ErrorPage";
import { ComingSoon } from "./ComingSoon";
import * as permsHook from "../../auth/usePermissions";

vi.spyOn(permsHook, "usePermissions").mockReturnValue({
  isLoading: false,
  permissions: ["okr.read", "project.read", "workforce.read", "report.read"],
  roles: [],
  hasPermission: () => true,
  hasAnyPermission: () => true,
  hasRole: () => false,
} as ReturnType<typeof permsHook.usePermissions>);

describe("portal pages", () => {
  it("Dashboard renders heading", () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /dashboard/i })).toBeInTheDocument();
  });
  it("NotFound shows link to portal home", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/app");
  });
  it("ErrorPage shows retry button and reports message", () => {
    render(<ErrorPage message="boom" onRetry={() => {}} />);
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
  it("ComingSoon shows domain label", () => {
    render(<ComingSoon domain="OKR" />);
    expect(screen.getAllByText(/OKR/).length).toBeGreaterThan(0);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});
