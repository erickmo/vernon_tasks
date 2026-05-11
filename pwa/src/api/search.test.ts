import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchSearchResults, filtersActive } from "./search";

beforeEach(() => vi.restoreAllMocks());

describe("search", () => {
  it("encodes filters in URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { results: [], total: 0 } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchSearchResults({
      query: "laporan",
      priority: ["Tinggi", "Sedang"],
      project: "PROJ-A",
      due_range: "today",
    });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("query=laporan");
    expect(url).toContain("priority=Tinggi%2CSedang");
    expect(url).toContain("project=PROJ-A");
    expect(url).toContain("due_range=today");
  });

  it("omits empty filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { results: [], total: 0 } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await fetchSearchResults({ due_range: "all" });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain("?");
  });
});

describe("filtersActive", () => {
  it("true when query non-empty", () => {
    expect(filtersActive({ query: "x" })).toBe(true);
  });
  it("false for empty filters", () => {
    expect(filtersActive({ due_range: "all" })).toBe(false);
  });
  it("true when priority list non-empty", () => {
    expect(filtersActive({ priority: ["Tinggi"] })).toBe(true);
  });
});
