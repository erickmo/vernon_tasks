import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TopBar } from "./TopBar";
import * as permsHook from "../auth/usePermissions";
import * as telemetry from "../telemetry";

function mockPerms(perms: string[]) {
  vi.spyOn(permsHook, "usePermissions").mockReturnValue({
    isLoading: false,
    permissions: perms,
    roles: [],
    hasPermission: (p: string) => perms.includes(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => perms.includes(p)),
    hasRole: () => false,
  } as ReturnType<typeof permsHook.usePermissions>);
}

describe("TopBar", () => {
  it("filters nav items by permission", () => {
    mockPerms(["project.read"]);
    render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projects" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "OKR" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Workforce" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reports" })).toBeNull();
  });

  it("emits nav_click telemetry on link click", () => {
    mockPerms(["okr.read"]);
    const spy = vi.spyOn(telemetry, "trackPortalNavClick");
    render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "OKR" }));
    expect(spy).toHaveBeenCalledWith("okr", "/portal/okr");
  });
});
