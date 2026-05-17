import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications,
  markRead,
  markAllRead,
  Notification,
} from "../../api/notifications";
import { NotificationRow } from "../../components/NotificationRow";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { PullToRefresh } from "../../components/PullToRefresh";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n";
import { logEvent } from "../../telemetry";

export function NotificationsPage() {
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(50, false).then((r) => r.results),
  });
  const qc = useQueryClient();
  const nav = useNavigate();
  const { show } = useToast();

  useEffect(() => {
    logEvent("notif_view", {});
  }, []);

  async function onTap(n: Notification) {
    if (n.read === 0) {
      qc.setQueryData<Notification[]>(["notifications"], (prev) =>
        prev?.map((x) => (x.name === n.name ? { ...x, read: 1 as const } : x)),
      );
      qc.invalidateQueries({ queryKey: ["unread-count"] });
      try {
        await markRead(n.name);
      } catch {
        qc.invalidateQueries({ queryKey: ["notifications"] });
      }
    }
    logEvent("notif_tap", {
      type: n.type ?? "",
      has_target: !!(n.document_type && n.document_name),
    });
    if (n.document_type === "VT Task" && n.document_name) {
      nav(`/m/work/${encodeURIComponent(n.document_name)}`);
    }
  }

  async function onMarkAll() {
    qc.setQueryData<Notification[]>(["notifications"], (prev) =>
      prev?.map((x) => ({ ...x, read: 1 as const })),
    );
    qc.invalidateQueries({ queryKey: ["unread-count"] });
    logEvent("notif_mark_all_read", {});
    try {
      await markAllRead();
    } catch {
      show(t("notif.failed"));
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  return (
    <PullToRefresh onRefresh={() => q.refetch().then(() => {})}>
      <div style={{ background: "var(--vt-primary-light)", minHeight: "100%" }}>
        {/* Sticky gradient header */}
        <header
          style={{
            background: "var(--vt-primary-light)",
            padding: "var(--vt-space-4)",
            position: "sticky",
            top: 0,
            zIndex: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h1 style={{ margin: 0, color: "var(--vt-primary-dark)", fontSize: 14, fontWeight: 600 }}>
            {t("notif.title")}
          </h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              to="/m/me/notifications/settings"
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--vt-border)",
                background: "transparent",
                color: "var(--vt-text)",
                textDecoration: "none",
                fontSize: 13,
              }}
            >
              {t("pref.link")}
            </Link>
            <button
              onClick={onMarkAll}
              disabled={!q.data?.some((n) => n.read === 0)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--vt-border)",
                background: "transparent",
                color: "var(--vt-text)",
                fontSize: 13,
                cursor: "pointer",
                opacity: !q.data?.some((n) => n.read === 0) ? 0.5 : 1,
              }}
            >
              {t("notif.mark_all")}
            </button>
          </div>
        </header>

        {/* Content */}
        <div style={{ padding: "var(--vt-space-4)" }}>
          {q.isLoading && (
            <>
              <Skeleton height={64} />
              <div style={{ height: 8 }} />
              <Skeleton height={64} />
              <div style={{ height: 8 }} />
              <Skeleton height={64} />
            </>
          )}

          {q.isError && (
            <EmptyState
              title={t("notif.failed")}
              cta={{ label: t("common.retry"), onClick: () => q.refetch() }}
            />
          )}

          {q.data && q.data.length === 0 && <EmptyState title={t("notif.empty")} />}

          {q.data && q.data.length > 0 && (
            <div
              style={{
                background: "white",
                borderRadius: "var(--vt-radius)",
                boxShadow: "0 1px 6px rgba(149,97,171,0.08)",
                overflow: "hidden",
              }}
            >
              {q.data.map((n) => (
                <NotificationRow key={n.name} notification={n} onClick={() => onTap(n)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
