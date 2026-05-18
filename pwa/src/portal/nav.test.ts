import { describe, it, expect } from "vitest";
import { portalNav, filterNavByPermissions } from "./nav";

describe("portal nav registry", () => {
  it("includes the 6 Phase-1 entries", () => {
    const keys = portalNav.map((n) => n.key);
    expect(keys).toEqual(["dashboard", "okr", "projects", "notifications", "workforce", "reports"]);
  });

  it("dashboard requires no permission", () => {
    const dash = portalNav.find((n) => n.key === "dashboard")!;
    expect(dash.permission).toBeNull();
  });

  it("filterNavByPermissions keeps items the user can see", () => {
    const filtered = filterNavByPermissions(portalNav, (p) => p === "project.read");
    const keys = filtered.map((n) => n.key);
    expect(keys).toEqual(["dashboard", "projects", "notifications"]);
  });
});
