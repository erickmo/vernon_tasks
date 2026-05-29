import { describe, it, expect } from "vitest";
import { router } from "../../../router";

function paths(routes: { path?: string; children?: unknown[] }[]): string[] {
  return routes
    .flatMap((r) => [r.path, ...(r.children ? paths(r.children as { path?: string; children?: unknown[] }[]) : [])])
    .filter(Boolean) as string[];
}

describe("mobile sprint route", () => {
  it("registers /m/sprint/:sprintId", () => {
    expect(paths(router.routes as { path?: string; children?: unknown[] }[])).toContain("/m/sprint/:sprintId");
  });
});
