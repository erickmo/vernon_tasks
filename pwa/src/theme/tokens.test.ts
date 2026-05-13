import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("tokens.css", () => {
  const css = readFileSync(resolve(__dirname, "tokens.css"), "utf-8");

  it("defines --vt-primary as #7c4dab", () => {
    expect(css).toContain("--vt-primary: #7c4dab");
  });

  it("defines --vt-primary-dark", () => {
    expect(css).toContain("--vt-primary-dark: #3d1f6e");
  });

  it("defines --vt-primary-mid", () => {
    expect(css).toContain("--vt-primary-mid: #5a2d8c");
  });

  it("defines --vt-primary-light", () => {
    expect(css).toContain("--vt-primary-light: #f4f0f9");
  });

  it("defines --vt-primary-contrast as #ffffff", () => {
    expect(css).toContain("--vt-primary-contrast: #ffffff");
  });

});
