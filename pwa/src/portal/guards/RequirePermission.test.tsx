import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequirePermission } from "./RequirePermission";
import * as permsHook from "../../auth/usePermissions";

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

describe("RequirePermission", () => {
  it("renders children when permission present", () => {
    mockPerms(["okr.read"]);
    render(
      <MemoryRouter initialEntries={["/portal/okr"]}>
        <Routes>
          <Route
            path="/portal/okr"
            element={
              <RequirePermission perm="okr.read">
                <div>OKR Page</div>
              </RequirePermission>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("OKR Page")).toBeInTheDocument();
  });

  it("renders PermissionDenied when permission missing", () => {
    mockPerms([]);
    render(
      <MemoryRouter initialEntries={["/portal/okr"]}>
        <Routes>
          <Route
            path="/portal/okr"
            element={
              <RequirePermission perm="okr.read">
                <div>OKR Page</div>
              </RequirePermission>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText("OKR Page")).toBeNull();
    expect(screen.getByText(/permission/i)).toBeInTheDocument();
  });
});
