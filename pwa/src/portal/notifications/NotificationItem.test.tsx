import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotificationItem } from "./NotificationItem";
import type { PortalNotification } from "./api/portalNotifications";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function makeNotif(overrides: Partial<PortalNotification> = {}): PortalNotification {
  return {
    name: "VN-0001",
    event_type: "task_assigned",
    reference_doctype: "VT Task",
    reference_name: "VT-0042",
    message: "Task assigned to you: Fix login",
    is_read: 0,
    creation: "2026-05-18 10:00:00",
    user: "test@test.local",
    ...overrides,
  };
}

function renderItem(notif: PortalNotification, onRead = vi.fn()) {
  return render(
    <MemoryRouter>
      <NotificationItem notification={notif} onRead={onRead} />
    </MemoryRouter>
  );
}

describe("NotificationItem", () => {
  it("unread item has data-unread=true", () => {
    const { container } = renderItem(makeNotif({ is_read: 0 }));
    expect(container.querySelector("[data-unread='true']")).toBeTruthy();
  });

  it("read item has data-unread=false", () => {
    const { container } = renderItem(makeNotif({ is_read: 1 }));
    expect(container.querySelector("[data-unread='false']")).toBeTruthy();
  });

  it("click calls onRead with correct name", () => {
    const onRead = vi.fn();
    renderItem(makeNotif(), onRead);
    fireEvent.click(screen.getByRole("button"));
    expect(onRead).toHaveBeenCalledWith("VN-0001");
  });

  it("task_assigned click navigates to /portal/projects?task=<reference_name>", () => {
    mockNavigate.mockClear();
    renderItem(makeNotif({ event_type: "task_assigned", reference_name: "VT-0042" }));
    fireEvent.click(screen.getByRole("button"));
    expect(mockNavigate).toHaveBeenCalledWith("/portal/projects?task=VT-0042");
  });

  it("task_review click navigates to /portal/projects?task=<reference_name>", () => {
    mockNavigate.mockClear();
    renderItem(makeNotif({ event_type: "task_review", reference_name: "VT-0099" }));
    fireEvent.click(screen.getByRole("button"));
    expect(mockNavigate).toHaveBeenCalledWith("/portal/projects?task=VT-0099");
  });

  it("comment click navigates to /portal/projects?task=<reference_name>", () => {
    mockNavigate.mockClear();
    renderItem(makeNotif({ event_type: "comment", reference_name: "VT-0077" }));
    fireEvent.click(screen.getByRole("button"));
    expect(mockNavigate).toHaveBeenCalledWith("/portal/projects?task=VT-0077");
  });

  it("sprint_status click navigates to /portal/projects (no task param)", () => {
    mockNavigate.mockClear();
    renderItem(makeNotif({ event_type: "sprint_status", reference_name: "SP-0001" }));
    fireEvent.click(screen.getByRole("button"));
    expect(mockNavigate).toHaveBeenCalledWith("/portal/projects");
  });

  it("task_assigned shows clipboard icon", () => {
    const { container } = renderItem(makeNotif({ event_type: "task_assigned" }));
    expect(container.querySelector("[data-icon='task_assigned']")).toBeTruthy();
  });

  it("task_review shows review icon", () => {
    const { container } = renderItem(makeNotif({ event_type: "task_review" }));
    expect(container.querySelector("[data-icon='task_review']")).toBeTruthy();
  });

  it("sprint_status shows sprint icon", () => {
    const { container } = renderItem(makeNotif({ event_type: "sprint_status" }));
    expect(container.querySelector("[data-icon='sprint_status']")).toBeTruthy();
  });

  it("comment shows comment icon", () => {
    const { container } = renderItem(makeNotif({ event_type: "comment" }));
    expect(container.querySelector("[data-icon='comment']")).toBeTruthy();
  });

  it("renders message text", () => {
    renderItem(makeNotif({ message: "Task assigned to you: Fix login" }));
    expect(screen.getByText("Task assigned to you: Fix login")).toBeDefined();
  });

  it("renders relative timestamp", () => {
    renderItem(makeNotif());
    // date-fns formatDistanceToNow returns something like "X minutes ago" or "about X years ago"
    const timeEl = document.querySelector("time");
    expect(timeEl).toBeTruthy();
  });
});
