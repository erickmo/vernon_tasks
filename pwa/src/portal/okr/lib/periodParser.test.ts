import { describe, it, expect } from "vitest";
import { parsePeriod } from "./periodParser";

describe("parsePeriod", () => {
  it("quarter", () => {
    expect(parsePeriod("2026-Q2")).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    expect(parsePeriod("2026-Q1")).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(parsePeriod("2026-Q4")).toEqual({ start: "2026-10-01", end: "2026-12-31" });
  });
  it("half", () => {
    expect(parsePeriod("2026-H1")).toEqual({ start: "2026-01-01", end: "2026-06-30" });
    expect(parsePeriod("2026-H2")).toEqual({ start: "2026-07-01", end: "2026-12-31" });
  });
  it("year", () => {
    expect(parsePeriod("2026")).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });
  it("unknown", () => {
    expect(parsePeriod("foo")).toBeNull();
    expect(parsePeriod("")).toBeNull();
  });
});
