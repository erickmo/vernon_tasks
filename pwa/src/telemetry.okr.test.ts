import { describe, it, expect, vi, beforeEach } from "vitest";
import * as telemetry from "./telemetry";

describe("okr telemetry events", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("trackOkrListView emits okr.list_view", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackOkrListView(3);
    expect(spy).toHaveBeenCalledWith("okr.list_view", { filters_count: 3 });
  });

  it("trackOkrDetailView emits okr.detail_view", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackOkrDetailView("O-1");
    expect(spy).toHaveBeenCalledWith("okr.detail_view", { name: "O-1" });
  });

  it("trackOkrKrUpdate emits okr.kr_update", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackOkrKrUpdate("KR-1", 12);
    expect(spy).toHaveBeenCalledWith("okr.kr_update", { kr_name: "KR-1", delta: 12 });
  });

  it("trackOkrBulkPdca emits okr.bulk_pdca_advance", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackOkrBulkPdca(2, [["PLAN", "DO"], ["DO", "CHECK"]]);
    expect(spy).toHaveBeenCalledWith("okr.bulk_pdca_advance", { count: 2, from_to_pairs: [["PLAN", "DO"], ["DO", "CHECK"]] });
  });
});
