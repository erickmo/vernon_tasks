import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPublicKey, subscribePush, unsubscribePush } from "./push";

beforeEach(() => vi.restoreAllMocks());

describe("push api", () => {
  it("getPublicKey returns public_key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: { public_key: "PUB" } }), { status: 200 }),
      ),
    );
    const r = await getPublicKey();
    expect(r.public_key).toBe("PUB");
  });

  it("subscribePush POSTs payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { ok: true, renewed: false } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await subscribePush("E1", "P", "A", "UA");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      endpoint: "E1",
      p256dh: "P",
      auth: "A",
      user_agent: "UA",
    });
  });

  it("unsubscribePush POSTs endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { ok: true } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await unsubscribePush("E2");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ endpoint: "E2" });
  });
});
