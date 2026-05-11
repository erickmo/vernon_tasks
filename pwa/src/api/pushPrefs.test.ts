import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPushPrefs, updatePushPrefs } from "./pushPrefs";

beforeEach(() => vi.restoreAllMocks());

describe("pushPrefs api", () => {
  it("fetch hits get_prefs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: { event_assignment: 1, event_mention: 0, event_due: 1, event_review: 1 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchPushPrefs();
    expect(r.event_mention).toBe(0);
    expect(fetchMock.mock.calls[0][0]).toContain("get_prefs");
  });

  it("update posts all flags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { ok: true } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await updatePushPrefs({
      event_assignment: 1,
      event_mention: 0,
      event_due: 1,
      event_review: 0,
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      event_assignment: 1,
      event_mention: 0,
      event_due: 1,
      event_review: 0,
    });
  });
});
