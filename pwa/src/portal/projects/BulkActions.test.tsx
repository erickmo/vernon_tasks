import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BulkActions } from "./BulkActions";
import * as bulkApi from "./api/bulk";

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe("Projects BulkActions", () => {
  it("hidden when nothing selected", () => {
    wrap(<BulkActions selected={new Set()} />);
    expect(screen.queryByRole("button", { name: /advance/i })).toBeNull();
  });

  it("PDCA confirm calls bulk with __next__", async () => {
    const spy = vi.spyOn(bulkApi, "bulkUpdateProjects").mockResolvedValue({ updated: [{ name: "P-1", changes: { pdca_phase: "DO" } }], skipped: [] });
    wrap(<BulkActions selected={new Set(["P-1"])} />);
    fireEvent.click(screen.getByRole("button", { name: /advance pdca/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(["P-1"], { pdca_phase: "__next__" }));
  });

  it("status set confirm calls bulk with target status", async () => {
    const spy = vi.spyOn(bulkApi, "bulkUpdateProjects").mockResolvedValue({ updated: [{ name: "P-1", changes: { status: "At Risk" } }], skipped: [] });
    wrap(<BulkActions selected={new Set(["P-1"])} />);
    fireEvent.click(screen.getByRole("button", { name: /set status/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^At Risk$/ }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(["P-1"], { status: "At Risk" }));
  });
});
