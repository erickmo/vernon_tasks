import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationItem } from "./NotificationItem";
import type { PortalNotification } from "./api/portalNotifications";

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

describe("NotificationItem", () => {
  it("unread item has data-unread=true", () => {
    const { container } = render(
      <NotificationItem notification={makeNotif({ is_read: 0 })} onRead={vi.fn()} />
    );
    expect(container.querySelector("[data-unread='true']")).toBeTruthy();
  });

  it("read item has data-unread=false", () => {
    const { container } = render(
      <NotificationItem notification={makeNotif({ is_read: 1 })} onRead={vi.fn()} />
    );
    expect(container.querySelector("[data-unread='false']")).toBeTruthy();
  });

  it("click calls onRead with correct name", () => {
    const onRead = vi.fn();
    render(<NotificationItem notification={makeNotif()} onRead={onRead} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onRead).toHaveBeenCalledWith("VN-0001");
  });

  it("task_assigned shows clipboard icon", () => {
    const { container } = render(
      <NotificationItem notification={makeNotif({ event_type: "task_assigned" })} onRead={vi.fn()} />
    );
    expect(container.querySelector("[data-icon='task_assigned']")).toBeTruthy();
  });

  it("task_review shows review icon", () => {
    const { container } = render(
      <NotificationItem notification={makeNotif({ event_type: "task_review" })} onRead={vi.fn()} />
    );
    expect(container.querySelector("[data-icon='task_review']")).toBeTruthy();
  });

  it("sprint_status shows sprint icon", () => {
    const { container } = render(
      <NotificationItem notification={makeNotif({ event_type: "sprint_status" })} onRead={vi.fn()} />
    );
    expect(container.querySelector("[data-icon='sprint_status']")).toBeTruthy();
  });

  it("comment shows comment icon", () => {
    const { container } = render(
      <NotificationItem notification={makeNotif({ event_type: "comment" })} onRead={vi.fn()} />
    );
    expect(container.querySelector("[data-icon='comment']")).toBeTruthy();
  });

  it("renders message text", () => {
    render(
      <NotificationItem notification={makeNotif({ message: "Task assigned to you: Fix login" })} onRead={vi.fn()} />
    );
    expect(screen.getByText("Task assigned to you: Fix login")).toBeDefined();
  });

  it("renders relative timestamp", () => {
    render(<NotificationItem notification={makeNotif()} onRead={vi.fn()} />);
    // date-fns formatDistanceToNow returns something like "X minutes ago" or "about X years ago"
    const timeEl = document.querySelector("time");
    expect(timeEl).toBeTruthy();
  });
});
