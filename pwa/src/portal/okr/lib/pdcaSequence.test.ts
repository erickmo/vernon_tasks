import { describe, it, expect } from "vitest";
import { PDCA_SEQUENCE, nextPdca } from "./pdcaSequence";

describe("pdcaSequence", () => {
  it("constant", () => {
    expect(PDCA_SEQUENCE).toEqual(["PLAN", "DO", "CHECK", "ACT", "CLOSED"]);
  });
  it("forward", () => {
    expect(nextPdca("PLAN")).toBe("DO");
    expect(nextPdca("DO")).toBe("CHECK");
    expect(nextPdca("CHECK")).toBe("ACT");
    expect(nextPdca("ACT")).toBe("CLOSED");
  });
  it("closed and invalid return null", () => {
    expect(nextPdca("CLOSED")).toBeNull();
    expect(nextPdca("INVALID")).toBeNull();
  });
});
