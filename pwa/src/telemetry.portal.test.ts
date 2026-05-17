import { describe, it, expect, vi, beforeEach } from "vitest";
import * as telemetry from "./telemetry";

describe("portal telemetry events", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("trackPortalPageView emits 'portal.page_view' with path", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackPortalPageView("/app/okr");
    expect(spy).toHaveBeenCalledWith("portal.page_view", { path: "/app/okr" });
  });

  it("trackPortalNavClick emits 'portal.nav_click' with key+path", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackPortalNavClick("okr", "/app/okr");
    expect(spy).toHaveBeenCalledWith("portal.nav_click", { key: "okr", path: "/app/okr" });
  });

  it("trackPortalPermissionDenied emits with required perm", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackPortalPermissionDenied("/app/okr", "okr.read");
    expect(spy).toHaveBeenCalledWith("portal.permission_denied", {
      path: "/app/okr",
      required_perm: "okr.read",
    });
  });

  it("trackPortalError emits with path+message", () => {
    const spy = vi.spyOn(telemetry, "logEvent");
    telemetry.trackPortalError("/app/okr", "boom");
    expect(spy).toHaveBeenCalledWith("portal.error", { path: "/app/okr", message: "boom" });
  });
});
