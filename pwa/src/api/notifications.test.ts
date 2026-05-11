import { describe, it, expect, vi, beforeEach } from "vitest";
import { listNotifications, markRead, countUnread } from "./notifications";

beforeEach(() => vi.restoreAllMocks());

describe("notifications api", () => {
  it("listNotifications passes limit + only_unread", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { results: [] } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await listNotifications(25, true);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("limit=25");
    expect(url).toContain("only_unread=1");
  });

  it("markRead POSTs name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { ok: true } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await markRead("N1");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "N1" });
  });

  it("countUnread returns count", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { count: 7 } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await countUnread();
    expect(r.count).toBe(7);
  });
});
