import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineBanner } from "./OfflineBanner";

describe("OfflineBanner", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  });
  it("renders with danger background and white text when offline", () => {
    render(<OfflineBanner />);
    const banner = screen.getByRole("status");
    const style = banner.getAttribute("style") ?? "";
    expect(style).toContain("var(--vt-danger)");
    expect(style).toContain("#fff");
  });
});
