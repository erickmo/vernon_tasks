import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationsFeatureGate } from "./NotificationsFeatureGate";

vi.mock("./api/portalNotifications", () => ({
  portalNotificationsApi: {
    getFeatureFlag: vi.fn(),
  },
}));

import { portalNotificationsApi } from "./api/portalNotifications";
const mockGetFeatureFlag = vi.mocked(portalNotificationsApi.getFeatureFlag);

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

describe("NotificationsFeatureGate", () => {
  it("renders children when flag is enabled", async () => {
    mockGetFeatureFlag.mockResolvedValue({ enabled: true });

    const { findByText } = renderGate();

    expect(await findByText("Notification Bell")).toBeDefined();
  });

  it("renders null when flag is disabled", async () => {
    mockGetFeatureFlag.mockResolvedValue({ enabled: false });

    const { container, queryByText } = renderGate();

    // Wait for the query to settle
    await new Promise((r) => setTimeout(r, 0));

    expect(queryByText("Notification Bell")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("renders null while loading (query pending)", () => {
    // Never resolves → stays in loading state
    mockGetFeatureFlag.mockReturnValue(new Promise(() => {}));

    const { container } = renderGate();

    expect(container.firstChild).toBeNull();
  });

  it("renders null on error", async () => {
    mockGetFeatureFlag.mockRejectedValue(new Error("network error"));

    const { container, queryByText } = renderGate();

    await new Promise((r) => setTimeout(r, 0));

    expect(queryByText("Notification Bell")).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});
