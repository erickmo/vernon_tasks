import { describe, it, expect, vi, beforeEach } from "vitest";
import * as telemetry from "./telemetry";

describe("portal telemetry events", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("trackPortalPageView emits 'portal.page_view' with path", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackPortalPageView("/portal/okr");
    expect(spy).toHaveBeenCalledWith("portal.page_view", { path: "/portal/okr" });
  });

  it("trackPortalNavClick emits 'portal.nav_click' with key+path", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackPortalNavClick("okr", "/portal/okr");
    expect(spy).toHaveBeenCalledWith("portal.nav_click", { key: "okr", path: "/portal/okr" });
  });

  it("trackPortalPermissionDenied emits with required perm", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackPortalPermissionDenied("/portal/okr", "okr.read");
    expect(spy).toHaveBeenCalledWith("portal.permission_denied", {
      path: "/portal/okr",
      required_perm: "okr.read",
    });
  });

  it("trackPortalError emits with path+message", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackPortalError("/portal/okr", "boom");
    expect(spy).toHaveBeenCalledWith("portal.error", { path: "/portal/okr", message: "boom" });
  });
});
