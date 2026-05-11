import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchTaskDetail } from "../../api/tasks";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { fmtDate, fmtTime, t } from "../../i18n";
import { logEvent } from "../../telemetry";

export function MyWorkDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ["task", id],
    queryFn: () => fetchTaskDetail(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (id) logEvent("task_view", { task_id: id });
  }, [id]);

  if (q.isLoading) {
    return (
      <div style={{ padding: 16 }}>
        <Skeleton height={28} width="60%" />
        <div style={{ height: 12 }} />
        <Skeleton height={120} />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <EmptyState
        title={t("empty.no_offline")}
        cta={{ label: t("common.retry"), onClick: () => q.refetch() }}
      />
    );
  }
  const d = q.data;
  return (
    <div style={{ padding: 16 }}>
      <Link to="/m/work" style={{ color: "var(--vt-primary)", textDecoration: "none" }}>
        ← {t("nav.tasks")}
      </Link>
      <h1 style={{ marginTop: 12 }}>{d.title}</h1>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          color: "var(--vt-text-muted)",
          marginBottom: 16,
        }}
      >
        {d.status && <span>{d.status}</span>}
        {d.priority && <span>· {d.priority}</span>}
        {d.due_date && <span>· {fmtDate(d.due_date)}</span>}
        {d.points ? <span>· +{d.points} pts</span> : null}
      </div>
      {d.description && (
        <div
          style={{
            background: "var(--vt-surface)",
            padding: 16,
            borderRadius: "var(--vt-radius)",
            whiteSpace: "pre-wrap",
            marginBottom: 16,
          }}
        >
          {d.description}
        </div>
      )}
      <h3>Aktivitas</h3>
      {d.activity.length === 0 && <p style={{ color: "var(--vt-text-muted)" }}>—</p>}
      {d.activity.map((a, idx) => (
        <div key={idx} style={{ padding: 12, borderTop: "1px solid var(--vt-border)" }}>
          <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>
            {a.owner} · {fmtDate(a.creation)} {fmtTime(a.creation)}
          </div>
          <div>{a.content}</div>
        </div>
      ))}
      <div
        style={{
          marginTop: 24,
          padding: 16,
          background: "var(--vt-surface)",
          borderRadius: "var(--vt-radius)",
          textAlign: "center",
          color: "var(--vt-text-muted)",
        }}
      >
        {t("tasks.detail.action_disabled")}
      </div>
    </div>
  );
}
