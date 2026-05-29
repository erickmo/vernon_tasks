import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EmptyState } from "./EmptyState";
import { OfflineBanner } from "./OfflineBanner";
import { StaleBadge } from "./StaleBadge";
import { BottomNav } from "./BottomNav";
import { stamp } from "../cache/sync-time";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { count: 0 } }), { status: 200 }),
    ),
  );
});

describe("components", () => {
  it("EmptyState renders title + cta", () => {
    render(<EmptyState title="Kosong" cta={{ label: "Coba", onClick: () => {} }} />);
    expect(screen.getByText("Kosong")).toBeInTheDocument();
    expect(screen.getByText("Coba")).toBeInTheDocument();
  });

  it("OfflineBanner shows when offline", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <OfflineBanner />
      </QueryClientProvider>,
    );
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it("StaleBadge prints relative time", () => {
    stamp("my-work");
    render(<StaleBadge resource="my-work" />);
    expect(screen.getByText(/baru saja/i)).toBeInTheDocument();
  });

  it("BottomNav highlights active route", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/m/project"]}>
          <BottomNav />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const tasks = screen.getByText("Tugas").closest("a");
    expect(tasks).toHaveAttribute("aria-current", "page");
  });
});
