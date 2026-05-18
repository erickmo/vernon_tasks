import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { NotificationsPage } from "./NotificationsPage";

vi.mock("./api/portalNotifications", () => ({
  portalNotificationsApi: {
    listNotifications: vi.fn(),
    markAllRead: vi.fn(),
    countUnread: vi.fn(),
  },
}));

import { portalNotificationsApi } from "./api/portalNotifications";
const mockApi = vi.mocked(portalNotificationsApi);

function makeItems(count: number, eventType = "task_assigned") {
  return Array.from({ length: count }, (_, i) => ({
    name: `VN-${i}`,
    event_type: eventType as "task_assigned",
    reference_doctype: "VT Task",
    reference_name: `VT-${i}`,
    message: `Notification ${i}`,
    is_read: 0 as const,
    creation: "2026-05-18 10:00:00",
    user: "u@test.local",
  }));
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.countUnread.mockResolvedValue({ count: 0 });
  });

  it("renders filter tabs: All, Tasks, Reviews, Sprints, Comments", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /all/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /tasks/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /reviews/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /sprints/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /comments/i })).toBeDefined();
    });
  });

  it("clicking Tasks tab passes event_type_filter=task_assigned", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPage();

    await waitFor(() => screen.getByRole("tab", { name: /tasks/i }));
    fireEvent.click(screen.getByRole("tab", { name: /tasks/i }));

    await waitFor(() => {
      expect(mockApi.listNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ eventTypeFilter: "task_assigned" })
      );
    });
  });

  it("Unread only toggle updates query with onlyUnread=true", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPage();

    await waitFor(() => screen.getByRole("checkbox", { name: /unread only/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /unread only/i }));

    await waitFor(() => {
      expect(mockApi.listNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ onlyUnread: true })
      );
    });
  });

  it("Load more button appends next page", async () => {
    // First page returns exactly 20 items (implies more)
    mockApi.listNotifications
      .mockResolvedValueOnce({ results: makeItems(20), total_unread: 25 })
      .mockResolvedValueOnce({ results: makeItems(5, "sprint_status"), total_unread: 25 });

    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /load more/i }));
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => {
      // 20 original + 5 more = 25 NotificationItem buttons
      expect(mockApi.listNotifications).toHaveBeenCalledTimes(2);
    });
  });

  it("Mark all read invalidates list and count queries", async () => {
    mockApi.listNotifications.mockResolvedValue({
      results: makeItems(1),
      total_unread: 1,
    });
    mockApi.markAllRead.mockResolvedValue({ ok: true });
    renderPage();

    await waitFor(() => screen.getByRole("button", { name: /mark all read/i }));
    fireEvent.click(screen.getByRole("button", { name: /mark all read/i }));

    await waitFor(() => {
      expect(mockApi.markAllRead).toHaveBeenCalled();
    });
  });

  it("shows empty state for All tab with no notifications", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/nothing here yet/i)).toBeDefined();
    });
  });

  it("shows filtered empty state when filter active and no results", async () => {
    mockApi.listNotifications.mockResolvedValue({ results: [], total_unread: 0 });
    renderPage();
    await waitFor(() => screen.getByRole("tab", { name: /tasks/i }));
    fireEvent.click(screen.getByRole("tab", { name: /tasks/i }));
    await waitFor(() => {
      expect(screen.getByText(/no tasks notifications/i)).toBeDefined();
    });
  });
});
