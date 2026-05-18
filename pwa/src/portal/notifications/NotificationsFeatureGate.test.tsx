import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationsFeatureGate } from "./NotificationsFeatureGate";
import type { VtSettings } from "../../hooks/useVtSettings";

type MockSettingsReturn = { data: VtSettings | undefined; isLoading: boolean; isError: boolean };

const { mockUseVtSettings } = vi.hoisted(() => ({
  mockUseVtSettings: vi.fn<() => MockSettingsReturn>(() => ({
    data: undefined,
    isLoading: true,
    isError: false,
  })),
}));

vi.mock("../../hooks/useVtSettings", () => ({
  useVtSettings: mockUseVtSettings,
}));

function renderGate(children = <div>Notification Bell</div>) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NotificationsFeatureGate>{children}</NotificationsFeatureGate>
    </QueryClientProvider>
  );
}

const BASE_SETTINGS: VtSettings = {
  portal_enabled: true,
  portal_okr_enabled: true,
  portal_projects_enabled: true,
  portal_sprints_enabled: true,
  portal_notifications_enabled: true,
  portal_reports_enabled: false,
};

describe("NotificationsFeatureGate", () => {
  it("renders children when flag is enabled", async () => {
    mockUseVtSettings.mockReturnValue({
      data: { ...BASE_SETTINGS, portal_notifications_enabled: true },
      isLoading: false,
      isError: false,
    });

    const { findByText } = renderGate();

    expect(await findByText("Notification Bell")).toBeDefined();
  });

  it("renders null when flag is disabled", async () => {
    mockUseVtSettings.mockReturnValue({
      data: { ...BASE_SETTINGS, portal_notifications_enabled: false },
      isLoading: false,
      isError: false,
    });

    const { container, queryByText } = renderGate();

    await waitFor(() => {
      expect(queryByText("Notification Bell")).toBeNull();
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders null while loading (query pending)", () => {
    mockUseVtSettings.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = renderGate();

    expect(container.firstChild).toBeNull();
  });

  it("renders null on error", async () => {
    mockUseVtSettings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const { container, queryByText } = renderGate();

    await waitFor(() => {
      expect(queryByText("Notification Bell")).toBeNull();
      expect(container.firstChild).toBeNull();
    });
  });
});
