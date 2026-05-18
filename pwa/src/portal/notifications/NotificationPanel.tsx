import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useNotifications } from "./hooks/useNotifications";
import { portalNotificationsApi } from "./api/portalNotifications";
import { NotificationItem } from "./NotificationItem";
import type { PortalNotification } from "./api/portalNotifications";
import * as telemetry from "../../telemetry";

interface Props {
  onClose: () => void;
}

function SkeletonRow() {
  return (
    <div className="notif-panel__skeleton" aria-hidden="true">
      <div className="notif-panel__skeleton-icon" />
      <div className="notif-panel__skeleton-body">
        <div className="notif-panel__skeleton-line" />
        <div className="notif-panel__skeleton-line notif-panel__skeleton-line--short" />
      </div>
    </div>
  );
}

export function NotificationPanel({ onClose }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useNotifications({
    limit: 5,
    offset: 0,
  });

  const items: PortalNotification[] = data?.results ?? [];
  const totalUnread: number = data?.total_unread ?? 0;

  async function handleMarkAllRead() {
    await portalNotificationsApi.markAllRead();
    telemetry.trackNotifMarkAllRead(totalUnread);
    queryClient.invalidateQueries({ queryKey: ["portal", "notif"] });
  }

  function handleRead(name: string) {
    const notif = items.find((n) => n.name === name);
    // Optimistic update
    queryClient.setQueryData(
      ["portal", "notif", "list", { limit: 5, offset: 0 }],
      (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          results: old.results.map((n) =>
            n.name === name ? { ...n, is_read: 1 as const } : n
          ),
        };
      }
    );
    portalNotificationsApi.markRead(name).then(() => {
      queryClient.invalidateQueries({ queryKey: ["portal", "notif", "count"] });
    });
    if (notif) {
      telemetry.trackNotifMarkRead(notif.event_type);
    }
  }

  return (
    <div
      className="notif-panel"
      role="dialog"
      aria-label="Notifications"
    >
      <div className="notif-panel__header">
        <span className="notif-panel__title">Notifications</span>
        {totalUnread > 0 && (
          <button
            type="button"
            className="notif-panel__mark-all"
            onClick={handleMarkAllRead}
            aria-label="Mark all read"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="notif-panel__list">
        {isLoading && (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        )}

        {isError && (
          <div className="notif-panel__error">
            <p>Could not load notifications. Retry?</p>
            <button type="button" onClick={() => refetch()} aria-label="Retry">
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="notif-panel__empty">
            <span>You&apos;re all caught up</span>
          </div>
        )}

        {!isLoading && !isError && items.map((notif) => (
          <NotificationItem
            key={notif.name}
            notification={notif}
            onRead={handleRead}
          />
        ))}
      </div>

      <div className="notif-panel__footer">
        <Link
          to="/portal/notifications"
          className="notif-panel__view-all"
          onClick={onClose}
        >
          View all notifications →
        </Link>
      </div>
    </div>
  );
}
