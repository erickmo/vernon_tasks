import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTaskDetail } from "../../api/tasks";
import { completeTask, logProgress, snoozeTask, SnoozeDays } from "../../api/mutations";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { TaskActions } from "../../components/TaskActions";
import { LogProgressModal } from "../../components/LogProgressModal";
import { useToast } from "../../components/Toast";
import { useCompleteCounter } from "../../hooks/useCompleteCounter";
import { fmtDate, fmtTime, t } from "../../i18n";
import { logEvent } from "../../telemetry";

export function MyWorkDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ["task", id],
    queryFn: () => fetchTaskDetail(id!),
    enabled: !!id,
  });
  const qc = useQueryClient();
  const nav = useNavigate();
  const { show } = useToast();
  const { increment } = useCompleteCounter();
  const [logOpen, setLogOpen] = useState(false);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  useEffect(() => {
    if (id) logEvent("task_view", { task_id: id });
  }, [id]);

  async function doComplete() {
    if (!id) return;
    if (offline) {
      show(t("actions.offline"));
      return;
    }
    try {
      await completeTask(id);
      logEvent("task_complete", { task_id: id });
      increment();
      qc.invalidateQueries({ queryKey: ["my-work"] });
      show(t("actions.completed_toast"));
      nav("/m/work");
    } catch {
      show(t("actions.failed"));
    }
  }

  async function doLog(hours: number, note: string) {
    setLogOpen(false);
    if (!id) return;
    if (offline) {
      show(t("actions.offline"));
      return;
    }
    try {
      await logProgress(id, hours, note);
      logEvent("task_log", { task_id: id, hours });
      show(t("actions.logged_toast"));
      qc.invalidateQueries({ queryKey: ["task", id] });
    } catch {
      show(t("actions.failed"));
    }
  }

  async function doSnooze(days: SnoozeDays) {
    if (!id) return;
    if (offline) {
      show(t("actions.offline"));
      return;
    }
    try {
      await snoozeTask(id, days);
      logEvent("task_snooze", { task_id: id, days });
      show(t("actions.snoozed_toast"));
      qc.invalidateQueries({ queryKey: ["task", id] });
      qc.invalidateQueries({ queryKey: ["my-work"] });
    } catch {
      show(t("actions.failed"));
    }
  }

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
          position: "sticky",
          bottom: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
          marginTop: 24,
          padding: 12,
          background: "var(--vt-bg)",
          borderTop: "1px solid var(--vt-border)",
        }}
      >
        <TaskActions
          onComplete={doComplete}
          onLog={() => setLogOpen(true)}
          onSnooze={() => doSnooze(1)}
          disabled={offline}
        />
      </div>

      <LogProgressModal
        open={logOpen}
        onSubmit={(h, n) => doLog(h, n)}
        onCancel={() => setLogOpen(false)}
      />
    </div>
  );
}
