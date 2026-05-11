import { describe, it, expect, vi } from "vitest";
import { probeSession } from "./session";
describe("session", () => {
    it("returns user on 200", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { user: "a@b.c", csrf_token: "tok" } }), {
            status: 200,
        })));
        const s = await probeSession();
        expect(s.user).toBe("a@b.c");
        expect(window.csrf_token).toBe("tok");
    });
    it("returns null on guest", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { user: null } }), { status: 200 })));
        const s = await probeSession();
        expect(s.user).toBeNull();
    });
});
