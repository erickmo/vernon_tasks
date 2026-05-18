import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationsFeatureGate } from "./NotificationsFeatureGate";

vi.mock("../../hooks/useVtSettings", () => ({
  useVtSettings: vi.fn(),
}));

import { useVtSettings } from "../../hooks/useVtSettings";
const mockUseVtSettings = vi.mocked(useVtSettings);

describe("NotificationsFeatureGate", () => {
  it("renders children when flag is enabled", () => {
    mockUseVtSettings.mockReturnValue({
      isLoading: false,
      data: { portal_notifications_enabled: 1 },
    } as ReturnType<typeof useVtSettings>);

    render(
      <NotificationsFeatureGate>
        <div>Notification Bell</div>
      </NotificationsFeatureGate>
    );

    expect(screen.getByText("Notification Bell")).toBeDefined();
  });

  it("renders null when flag is disabled", () => {
    mockUseVtSettings.mockReturnValue({
      isLoading: false,
      data: { portal_notifications_enabled: 0 },
    } as ReturnType<typeof useVtSettings>);

    const { container } = render(
      <NotificationsFeatureGate>
        <div>Notification Bell</div>
      </NotificationsFeatureGate>
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders null while loading", () => {
    mockUseVtSettings.mockReturnValue({
      isLoading: true,
      data: undefined,
    } as ReturnType<typeof useVtSettings>);

    const { container } = render(
      <NotificationsFeatureGate>
        <div>Notification Bell</div>
      </NotificationsFeatureGate>
    );

    expect(container.firstChild).toBeNull();
  });
});
