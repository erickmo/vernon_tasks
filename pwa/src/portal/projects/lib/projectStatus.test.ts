import { describe, it, expect } from "vitest";
import { PROJECT_STATUSES, isTerminalStatus } from "./projectStatus";

describe("projectStatus", () => {
  it("constant", () => {
    expect(PROJECT_STATUSES).toEqual(["Open", "On Track", "At Risk", "Closed"]);
  });
  it("isTerminalStatus", () => {
    expect(isTerminalStatus("Closed")).toBe(true);
    expect(isTerminalStatus("Open")).toBe(false);
    expect(isTerminalStatus("On Track")).toBe(false);
    expect(isTerminalStatus("At Risk")).toBe(false);
  });
});
