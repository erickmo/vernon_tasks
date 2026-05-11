import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchEmployeeStats, fetchSprintKanban } from "./dashboard";

beforeEach(() => vi.restoreAllMocks());

describe("dashboard api", () => {
  it("fetchEmployeeStats hits page method URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: { done_today: 1, done_week: 5, points_month: 12, blocked: 0 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchEmployeeStats();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/method/vernon_tasks.task.page.my_dashboard.my_dashboard.get_employee_stats",
    );
    expect(r.done_week).toBe(5);
  });

  it("fetchSprintKanban returns columns + sprint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            sprint: { name: "S1", title: "Test", start_date: "2026-05-01", end_date: "2026-05-14", progress_pct: 50 },
            columns: { Backlog: [], Doing: [{ id: "T1", title: "x", points: 3 }], Review: [], Done: [] },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchSprintKanban();
    expect(r.sprint?.progress_pct).toBe(50);
    expect(r.columns.Doing).toHaveLength(1);
  });
});
