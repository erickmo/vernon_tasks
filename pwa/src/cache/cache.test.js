import { describe, it, expect, beforeEach } from "vitest";
import { cacheGet, cachePut } from "./idb";
import { stamp, ageMs, isStale, STALE_THRESHOLD_MS } from "./sync-time";
beforeEach(() => {
    localStorage.clear();
});
describe("idb cache", () => {
    it("put then get returns same payload", async () => {
        await cachePut("k", { a: 1 });
        expect(await cacheGet("k")).toEqual({ a: 1 });
    });
    it("get returns undefined for missing", async () => {
        expect(await cacheGet("missing")).toBeUndefined();
    });
});
describe("sync-time", () => {
    it("stamp + ageMs returns small number", () => {
        stamp("k");
        expect(ageMs("k")).toBeLessThan(1000);
    });
    it("isStale true when > threshold", () => {
        localStorage.setItem("vt_sync:k", String(Date.now() - STALE_THRESHOLD_MS - 1000));
        expect(isStale("k")).toBe(true);
    });
    it("isStale true when never stamped", () => {
        expect(isStale("never")).toBe(true);
    });
});
