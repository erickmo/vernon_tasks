import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNotificationCount } from "./hooks/useNotificationCount";
import { NotificationPanel } from "./NotificationPanel";
import * as telemetry from "../../telemetry";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openedAt = useRef<number>(0);
  const count = useNotificationCount();
  const unreadCount = typeof count === "number" ? count : 0;

  const badgeLabel = unreadCount >= 100 ? "99+" : String(unreadCount);
  const ariaLabel =
    unreadCount > 0 ? `Notifications — ${unreadCount} unread` : "Notifications";

  function handleClick() {
    if (!isOpen) {
      // Compute panel position from button bounding rect
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setPanelPos({
          top: rect.bottom + 8,
          right: window.innerWidth - rect.right,
        });
      }
      openedAt.current = Date.now();
      telemetry.trackNotifBellOpen(unreadCount);
    } else {
      telemetry.trackNotifPanelClose(Date.now() - openedAt.current);
    }
    setIsOpen((prev) => !prev);
  }

  function handleClose() {
    telemetry.trackNotifPanelClose(Date.now() - openedAt.current);
    setIsOpen(false);
  }

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="portal-topbar__bell"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={handleClick}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-bell__badge" aria-hidden="true">
            {badgeLabel}
          </span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <div
            className="notif-bell__panel-wrapper"
            style={{
              position: "fixed",
              top: panelPos.top,
              right: panelPos.right,
              zIndex: 9999,
            }}
          >
            <NotificationPanel onClose={handleClose} />
          </div>,
          document.body
        )}
    </>
  );
}
