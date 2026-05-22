import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useProjectTasks } from "./useProjectTasks";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useProjectTasks", () => {
  it("fetches tasks for a project", async () => {
    const tasks = [
      { name: "VT-001", title: "Task A", pdca_phase: "Plan", priority: "High",
        assigned_to: "a@x.com", deadline: null, kanban_status: "Open",
        base_points: 10, completion_date: null },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: tasks }), { status: 200 }),
    ));
    const { result } = renderHook(() => useProjectTasks("PROJ-001"), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data![0].title).toBe("Task A");
  });

  it("is disabled when projectId is null", () => {
    vi.stubGlobal("fetch", vi.fn());
    const { result } = renderHook(() => useProjectTasks(null), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("uses correct cache key with pdca_phase filter", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: [] }), { status: 200 }),
    ));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const w = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    renderHook(() => useProjectTasks("PROJ-001", { pdca_phase: "Do" }), { wrapper: w });
    await waitFor(() => expect(qc.getQueryCache().getAll().length).toBeGreaterThan(0));
    const key = qc.getQueryCache().getAll()[0].queryKey;
    expect(key).toContain("PROJ-001");
    expect(JSON.stringify(key)).toContain("Do");
  });
});
