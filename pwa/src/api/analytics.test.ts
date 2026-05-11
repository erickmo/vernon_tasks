import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchLeaderboard, fetchVelocity, fetchStreak } from "./analytics";

beforeEach(() => vi.restoreAllMocks());

describe("analytics api", () => {
  it("fetchLeaderboard encodes period + limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchLeaderboard("week", 5);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("period=week");
    expect(url).toContain("limit=5");
  });

  it("fetchVelocity encodes project", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: { sprints: [], personal: [], team_avg: [], avg: 0, team_avg_total: 0 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchVelocity("PROJ A");
    expect((fetchMock.mock.calls[0][0] as string).includes("project=PROJ%20A")).toBe(true);
  });

  it("fetchStreak returns numbers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { streak: 5, sprints_checked: 6 } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchStreak("PROJ");
    expect(r.streak).toBe(5);
  });
});
