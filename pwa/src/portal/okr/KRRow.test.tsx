import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KRRow } from "./KRRow";
import type { KeyResult } from "./api/types";
import * as krApi from "./api/keyResults";

const kr: KeyResult = {
  name: "KR-1",
  metric: "MRR",
  target_value: 100,
  current_value: 40,
  unit: "k",
  progress_percent: 40,
  modified: "2026-05-01",
};

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe("KRRow", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders metric + current value", () => {
    wrap(<KRRow kr={kr} objectiveName="O-1" />);
    expect(screen.getByText("MRR")).toBeInTheDocument();
    expect(screen.getByDisplayValue("40")).toBeInTheDocument();
  });

  it("debounce autosave fires after 800ms", async () => {
    const spy = vi
      .spyOn(krApi, "updateKeyResult")
      .mockResolvedValue({ ...kr, current_value: 55 });
    wrap(<KRRow kr={kr} objectiveName="O-1" />);
    const input = screen.getByDisplayValue("40") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "55" } });
    expect(spy).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(spy).toHaveBeenCalledWith("KR-1", expect.objectContaining({ current_value: 55 }));
  });
});
