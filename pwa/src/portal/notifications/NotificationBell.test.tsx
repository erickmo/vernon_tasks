import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "./NotificationBell";

vi.mock("./hooks/useNotificationCount", () => ({
  useNotificationCount: vi.fn(),
}));
vi.mock("./NotificationPanel", () => ({
  NotificationPanel: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import { useNotificationCount } from "./hooks/useNotificationCount";
const mockCount = vi.mocked(useNotificationCount);

function renderBell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NotificationBell", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders without badge when count is 0", () => {
    mockCount.mockReturnValue(0 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    expect(document.querySelector(".notif-bell__badge")).toBeNull();
  });

  it("renders badge with correct count when count > 0", () => {
    mockCount.mockReturnValue(3 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    expect(screen.getByText("3")).toBeDefined();
  });

  it("badge shows 99+ when count >= 100", () => {
    mockCount.mockReturnValue(100 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    expect(screen.getByText("99+")).toBeDefined();
  });

  it("click opens panel (aria-expanded becomes true)", () => {
    mockCount.mockReturnValue(2 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    const btn = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(btn);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("second click closes panel", () => {
    mockCount.mockReturnValue(0 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    const btn = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape key closes panel", async () => {
    mockCount.mockReturnValue(0 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    const btn = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("aria-label reflects count when unread > 0", () => {
    mockCount.mockReturnValue(3 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("Notifications — 3 unread");
  });

  it("aria-label is plain Notifications when count is 0", () => {
    mockCount.mockReturnValue(0 as unknown as ReturnType<typeof useNotificationCount>);
    renderBell();
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-label")).toBe("Notifications");
  });
});
