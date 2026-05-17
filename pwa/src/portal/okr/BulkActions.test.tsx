import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BulkActions } from "./BulkActions";
import * as bulkApi from "./api/bulk";

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe("BulkActions", () => {
  it("hidden when nothing selected", () => {
    wrap(<BulkActions selected={new Set()} />);
    expect(screen.queryByRole("button", { name: /advance/i })).toBeNull();
  });

  it("triggers bulk advance after confirm", async () => {
    const spy = vi.spyOn(bulkApi, "bulkAdvancePdca").mockResolvedValue({
      advanced: [{ name: "O-1", from: "PLAN", to: "DO" }],
      skipped: [],
    });
    wrap(<BulkActions selected={new Set(["O-1"])} />);
    fireEvent.click(screen.getByRole("button", { name: /advance/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(["O-1"]));
  });
});
