import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { NotificationPanel } from "./NotificationPanel";

vi.mock("./api/portalNotifications", () => ({
  portalNotificationsApi: {
    listNotifications: vi.fn(),
    markAllRead: vi.fn(),
    countUnread: vi.fn(),
  },
}));

import { portalNotificationsApi } from "./api/portalNotifications";
const mockApi = vi.mocked(portalNotificationsApi);

function renderPanel(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationPanel onClose={vi.fn()} {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NotificationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.countUnread.mockResolvedValue({ count: 0 });
  });

  it("shows loading skeletons while fetching", () => {
    mockApi.listNotifications.mockReturnValue(new Promise(() => {}));
    renderPanel();
    const skeletons = document.querySelectorAll(".notif-panel__skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows 5 items when 5 notifications returned", async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      name: `VN-${i}`,
      event_type: "task_assigned" as const,
      reference_doctype: "VT Task",
      reference_name: `VT-${i}`,
      message: `Task ${i}`,
      is_read: 0 as const,
      creation: "2026-05-18 10:00:00",
      user: "u@test.local",
    }));
    mockApi.listNotifications.mockResolvedValue({ results: items, total_unread: 5 });

    renderPanel();

    await waitFor(() => {
      expect(screen.getAllByRole("button").filter(b => b.classList.contains("notif-item")).length).toBe(5);
    });
  });

  it("shows View all link pointing to /portal/notifications", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPanel();
    await waitFor(() => {
      const link = screen.getByText(/view all/i);
      expect(link).toBeDefined();
      expect((link as HTMLAnchorElement).getAttribute("href")).toBe("/portal/notifications");
    });
  });

  it("shows empty state when results empty", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/you're all caught up/i)).toBeDefined();
    });
  });

  it("shows error state on fetch failure with retry button", async () => {
    mockApi.listNotifications.mockRejectedValue(new Error("Network error"));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/could not load notifications/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /retry/i })).toBeDefined();
    });
  });

  it("Mark all read button calls markAllRead", async () => {
    mockApi.listNotifications.mockResolvedValue({
      results: [
        {
          name: "VN-1",
          event_type: "task_assigned" as const,
          reference_doctype: "VT Task",
          reference_name: "VT-1",
          message: "Task 1",
          is_read: 0 as const,
          creation: "2026-05-18 10:00:00",
          user: "u@test.local",
        },
      ],
      total_unread: 1,
    });
    mockApi.markAllRead.mockResolvedValue({ ok: true });

    renderPanel();

    await waitFor(() => screen.getByRole("button", { name: /mark all read/i }));
    fireEvent.click(screen.getByRole("button", { name: /mark all read/i }));

    await waitFor(() => {
      expect(mockApi.markAllRead).toHaveBeenCalled();
    });
  });
});
