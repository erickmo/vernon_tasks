import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { portalNotificationsApi, type PortalNotification } from "./api/portalNotifications";
import { NotificationItem } from "./NotificationItem";
import * as telemetry from "../../telemetry";

type FilterTab = {
  key: string;
  label: string;
  eventTypeFilter: string;
};

const FILTER_TABS: FilterTab[] = [
  { key: "all",      label: "All",      eventTypeFilter: "" },
  { key: "tasks",    label: "Tasks",    eventTypeFilter: "task_assigned" },
  { key: "reviews",  label: "Reviews",  eventTypeFilter: "task_review" },
  { key: "sprints",  label: "Sprints",  eventTypeFilter: "sprint_status" },
  { key: "comments", label: "Comments", eventTypeFilter: "comment" },
];

const PAGE_SIZE = 20;

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FilterTab>(FILTER_TABS[0]);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [items, setItems] = useState<PortalNotification[]>([]);
  const [offset, setOffset] = useState(0);
  const [totalUnread, setTotalUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (newOffset: number, append = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await portalNotificationsApi.listNotifications({
        limit: PAGE_SIZE,
        offset: newOffset,
        onlyUnread,
        eventTypeFilter: activeTab.eventTypeFilter,
      });
      setTotalUnread(result.total_unread);
      setHasMore(result.results.length === PAGE_SIZE);
      if (append) {
        setItems((prev) => [...prev, ...result.results]);
      } else {
        setItems(result.results);
      }
    } catch {
      setError("Failed to load notifications. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [activeTab.eventTypeFilter, onlyUnread]);

  // Reload on filter or unread-only change
  useEffect(() => {
    setOffset(0);
    setItems([]);
    loadPage(0, false);
    telemetry.trackNotifPageView(activeTab.eventTypeFilter, onlyUnread);
  }, [activeTab, onlyUnread, loadPage]);

  function handleTabChange(tab: FilterTab) {
    telemetry.trackNotifFilterChange(activeTab.eventTypeFilter, tab.eventTypeFilter);
    setActiveTab(tab);
  }

  function handleLoadMore() {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    telemetry.trackNotifLoadMore(newOffset, activeTab.eventTypeFilter);
    loadPage(newOffset, true);
  }

  async function handleMarkAllRead() {
    await portalNotificationsApi.markAllRead();
    telemetry.trackNotifMarkAllRead(totalUnread);
    queryClient.invalidateQueries({ queryKey: ["portal", "notif"] });
    setItems((prev) => prev.map((n) => ({ ...n, is_read: 1 as const })));
    setTotalUnread(0);
  }

  function handleRead(name: string) {
    const notif = items.find((n) => n.name === name);
    setItems((prev) =>
      prev.map((n) => (n.name === name ? { ...n, is_read: 1 as const } : n))
    );
    portalNotificationsApi.markRead(name).then(() => {
      queryClient.invalidateQueries({ queryKey: ["portal", "notif", "count"] });
    });
    if (notif) {
      telemetry.trackNotifMarkRead(notif.event_type);
      telemetry.trackNotifItemClick(notif.event_type, notif.is_read === 1);
    }
  }

  const emptyMessage =
    activeTab.key === "all"
      ? "Nothing here yet. Notifications will appear when tasks are assigned, reviewed, or sprints change."
      : `No ${activeTab.label.toLowerCase()} notifications.`;

  return (
    <div className="notif-page">
      <div className="notif-page__header">
        <h1 className="notif-page__title">Notifications</h1>
        {totalUnread > 0 && (
          <button
            type="button"
            className="notif-page__mark-all"
            onClick={handleMarkAllRead}
            aria-label="Mark all read"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="notif-page__filters" role="tablist" aria-label="Notification filters">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab.key === tab.key}
            className={`notif-page__tab ${activeTab.key === tab.key ? "notif-page__tab--active" : ""}`}
            onClick={() => handleTabChange(tab)}
            aria-label={tab.label}
          >
            {tab.label}
          </button>
        ))}
        <label className="notif-page__unread-toggle">
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(e) => setOnlyUnread(e.target.checked)}
            aria-label="Unread only"
          />
          Unread only
        </label>
      </div>

      <div className="notif-page__list">
        {error && (
          <div className="notif-page__error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="notif-page__retry"
              onClick={() => loadPage(offset, false)}
            >
              Retry
            </button>
          </div>
        )}

        {items.map((notif) => (
          <NotificationItem
            key={notif.name}
            notification={notif}
            onRead={handleRead}
          />
        ))}

        {!isLoading && items.length === 0 && (
          <div className="notif-page__empty">
            <p>{emptyMessage}</p>
          </div>
        )}

        {hasMore && !isLoading && (
          <button
            type="button"
            className="notif-page__load-more"
            onClick={handleLoadMore}
            aria-label="Load more"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
