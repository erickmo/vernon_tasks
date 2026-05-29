import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OfflineBanner } from "./OfflineBanner";

const logEvent = vi.fn();
vi.mock("../telemetry", () => ({ logEvent: (...a: unknown[]) => logEvent(...a) }));

const syncNow = vi.fn().mockResolvedValue(undefined);
const retry = vi.fn().mockResolvedValue(undefined);
let outbox = { pendingCount: 0, failedCount: 0, syncing: false, syncNow, retry };
vi.mock("../hooks/useOutbox", () => ({ useOutbox: () => outbox }));

let online = true;
vi.mock("../hooks/useOnline", () => ({ useOnline: () => online }));

beforeEach(() => {
  vi.clearAllMocks();
  online = true;
  outbox = { pendingCount: 0, failedCount: 0, syncing: false, syncNow, retry };
});

describe("OfflineBanner", () => {
  it("renders null when online and nothing pending", () => {
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });
  it("renders offline message with danger background when offline", () => {
    online = false;
    render(<OfflineBanner />);
    const banner = screen.getByRole("status");
    const style = banner.getAttribute("style") ?? "";
    expect(style).toContain("var(--vt-danger)");
    expect(style).toContain("#fff");
    expect(screen.getByText(/Mode offline/i)).toBeInTheDocument();
  });
  it("fires offline_seen when shown offline", () => {
    online = false;
    render(<OfflineBanner />);
    expect(logEvent).toHaveBeenCalledWith("offline_seen", {});
  });
  it("shows pending count and a Sync now button when pending > 0 (even online)", () => {
    outbox = { ...outbox, pendingCount: 3 };
    render(<OfflineBanner />);
    expect(screen.getByText(/3 aksi menunggu/i)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /sync/i });
    fireEvent.click(btn);
    expect(syncNow).toHaveBeenCalled();
  });
  it("disables Sync button and shows spinner text while syncing", () => {
    outbox = { ...outbox, pendingCount: 2, syncing: true };
    render(<OfflineBanner />);
    const btn = screen.getByRole("button", { name: /menyinkronkan/i });
    expect(btn).toBeDisabled();
  });
  it("shows failed count with a retry button when failed > 0", () => {
    outbox = { ...outbox, failedCount: 1 };
    render(<OfflineBanner />);
    expect(screen.getByText(/1 gagal/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /coba lagi/i }));
    expect(retry).toHaveBeenCalled();
  });
});
