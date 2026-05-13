import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("tokens.css", () => {
  const css = readFileSync(resolve(__dirname, "tokens.css"), "utf-8");

  it("defines --vt-primary as #9561ab", () => {
    expect(css).toContain("--vt-primary: #9561ab");
  });

  it("defines --vt-primary-dark", () => {
    expect(css).toContain("--vt-primary-dark: #2d1540");
  });

  it("defines --vt-primary-mid", () => {
    expect(css).toContain("--vt-primary-mid: #4a2870");
  });

  it("defines --vt-primary-light", () => {
    expect(css).toContain("--vt-primary-light: #f5f0f8");
  });

  it("defines --vt-primary-contrast as #ffffff", () => {
    expect(css).toContain("--vt-primary-contrast: #ffffff");
  });

  it("defines dark mode primary as #c084fc", () => {
    expect(css).toContain("--vt-primary: #c084fc");
  });
});
