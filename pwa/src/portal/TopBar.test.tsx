import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TopBar } from "./TopBar";
import * as permsHook from "../auth/usePermissions";
import * as telemetry from "../telemetry";
import * as vtSettingsHook from "../hooks/useVtSettings";

function mockVtSettings(enabled = false) {
  vi.spyOn(vtSettingsHook, "useVtSettings").mockReturnValue({
    isLoading: false,
    data: { portal_notifications_enabled: enabled ? 1 : 0 },
  } as ReturnType<typeof vtSettingsHook.useVtSettings>);
}

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

function renderTopBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TopBar", () => {
  it("filters nav items by permission", () => {
    mockPerms(["project.read"]);
    mockVtSettings(false);
    renderTopBar();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projects" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "OKR" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Workforce" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reports" })).toBeNull();
  });

  it("emits nav_click telemetry on link click", () => {
    mockPerms(["okr.read"]);
    mockVtSettings(false);
    const spy = vi.spyOn(telemetry, "trackPortalNavClick");
    renderTopBar();
    fireEvent.click(screen.getByRole("link", { name: "OKR" }));
    expect(spy).toHaveBeenCalledWith("okr", "/portal/okr");
  });
});
