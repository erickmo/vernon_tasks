import { describe, it, expect, vi, beforeEach } from "vitest";
import * as telemetry from "./telemetry";

describe("projects telemetry events", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("trackProjectsListView", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackProjectsListView(2);
    expect(spy).toHaveBeenCalledWith("projects.list_view", { filters_count: 2 });
  });

  it("trackProjectsDetailView", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackProjectsDetailView("P-1");
    expect(spy).toHaveBeenCalledWith("projects.detail_view", { name: "P-1" });
  });

  it("trackProjectsBulkPdca", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackProjectsBulkPdca(2, [["PLAN", "DO"]]);
    expect(spy).toHaveBeenCalledWith("projects.bulk_pdca_advance", { count: 2, from_to_pairs: [["PLAN", "DO"]] });
  });

  it("trackProjectsObjectiveLinkClick", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackProjectsObjectiveLinkClick("P-1", "OBJ-1");
    expect(spy).toHaveBeenCalledWith("projects.objective_link_click", { project: "P-1", objective: "OBJ-1" });
  });
});
