import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, onAuthChallenge } from "./client";

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("GET parses JSON body via .message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: { hello: "world" } }), { status: 200 }),
      ),
    );
    const r = await api.get<{ hello: string }>("/api/method/x");
    expect(r.hello).toBe("world");
  });

  it("emits auth challenge on 401", async () => {
    const cb = vi.fn().mockResolvedValue(true);
    onAuthChallenge(cb);
    const responses = [
      new Response("", { status: 401 }),
      new Response(JSON.stringify({ message: { ok: true } }), { status: 200 }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(responses.shift()!)),
    );
    const r = await api.get<{ ok: boolean }>("/api/method/x");
    expect(cb).toHaveBeenCalledOnce();
    expect(r.ok).toBe(true);
  });

  it("throws on 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );
    await expect(api.get("/api/method/x")).rejects.toThrow(/500/);
  });
});
