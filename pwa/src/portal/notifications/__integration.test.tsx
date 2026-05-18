import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { NotificationsFeatureGate } from "./NotificationsFeatureGate";
import { NotificationsPage } from "./NotificationsPage";
import { NotificationBell } from "./NotificationBell";

const { mockUseVtSettings } = vi.hoisted(() => ({
  mockUseVtSettings: vi.fn(() => ({
    data: { portal_notifications_enabled: true },
    isLoading: false,
    isError: false,
  })),
}));

vi.mock("../../hooks/useVtSettings", () => ({
  useVtSettings: mockUseVtSettings,
}));

vi.mock("./api/portalNotifications", () => ({
  portalNotificationsApi: {
    listNotifications: vi.fn(async () => ({
      results: [
        {
          name: "VN-INT-1",
          event_type: "task_assigned",
          reference_doctype: "VT Task",
          reference_name: "VT-INT-1",
          message: "Integration task assigned",
          is_read: 0,
          creation: "2026-05-18 10:00:00",
          user: "u@test.local",
        },
      ],
      total_unread: 1,
    })),
    countUnread: vi.fn(async () => ({ count: 1 })),
    markAllRead: vi.fn(async () => ({ ok: true })),
    markRead: vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock("./hooks/useNotificationCount", () => ({
  useNotificationCount: () => ({ data: 1, isLoading: false, isError: false }),
}));

function renderWithFlag(enabled: boolean) {
  mockUseVtSettings.mockReturnValue({
    data: { portal_notifications_enabled: enabled },
    isLoading: false,
    isError: false,
  });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/portal/notifications"]}>
        <Routes>
          <Route
            path="/portal/notifications"
            element={
              <NotificationsFeatureGate>
                <NotificationsPage />
              </NotificationsFeatureGate>
            }
          />
          <Route path="*" element={<div>Not Found</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Portal Notifications integration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders NotificationsPage when flag enabled", async () => {
    renderWithFlag(true);
    await waitFor(() => {
      expect(screen.getByText(/integration task assigned/i)).toBeDefined();
    });
  });

  it("renders null (not found fallback) when flag disabled", async () => {
    renderWithFlag(false);
    await waitFor(() => {
      expect(screen.queryByText(/integration task assigned/i)).toBeNull();
    });
  });

  it("bell click opens notification panel", async () => {
    mockUseVtSettings.mockReturnValue({
      data: { portal_notifications_enabled: true },
      isLoading: false,
      isError: false,
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <NotificationsFeatureGate>
            <NotificationBell />
          </NotificationsFeatureGate>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /notifications/i })).toBeTruthy();
    });

    const bell = screen.getByRole("button", { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
  });
});
