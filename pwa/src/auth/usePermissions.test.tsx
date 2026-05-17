import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { usePermissions } from "./usePermissions";
import * as api from "../api/permissions";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("usePermissions", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("hasPermission returns true for granted key", async () => {
    vi.spyOn(api, "fetchUserPermissions").mockResolvedValue({
      permissions: ["okr.read", "project.read"],
      roles: ["Projects Manager"],
    });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasPermission("okr.read")).toBe(true);
    expect(result.current.hasPermission("workforce.read")).toBe(false);
    expect(result.current.hasAnyPermission(["workforce.read", "okr.read"])).toBe(true);
    expect(result.current.hasRole("Projects Manager")).toBe(true);
  });

  it("returns empty perms when api fails", async () => {
    vi.spyOn(api, "fetchUserPermissions").mockRejectedValue(new Error("net"));
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasPermission("okr.read")).toBe(false);
  });
});
