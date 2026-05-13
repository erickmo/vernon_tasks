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

const STATUS_COLORS: Record<string, string> = {
  Backlog: "#94a3b8",
  Doing: "#9561ab",
  Review: "#f59e0b",
  Done: "#22c55e",
};

function MetaChip({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        background: "var(--vt-primary-light)",
        color: "var(--vt-primary)",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#9561ab";
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        background: color + "22",
        color,
        fontSize: 12,
        fontWeight: 700,
        border: `1px solid ${color}44`,
      }}
    >
      {status}
    </span>
  );
}

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
    if (offline) { show(t("actions.offline")); return; }
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
    if (offline) { show(t("actions.offline")); return; }
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
    if (offline) { show(t("actions.offline")); return; }
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
      <div style={{ background: "var(--vt-primary-light)", minHeight: "100%" }}>
        <div style={{ height: 72, background: "linear-gradient(135deg, #2d1540, #9561ab)" }} />
        <div style={{ padding: 16 }}>
          <Skeleton height={28} width="60%" />
          <div style={{ height: 12 }} />
          <Skeleton height={120} />
        </div>
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
    <div style={{ background: "var(--vt-primary-light)", minHeight: "100%" }}>
      {/* Sticky gradient header */}
      <header
        style={{
          background: "linear-gradient(135deg, #2d1540, #9561ab)",
          padding: "var(--vt-space-4)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <Link
          to="/m/work"
          style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none", fontSize: 14 }}
        >
          ← {t("nav.tasks")}
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <div
            style={{
              color: "white",
              fontWeight: 700,
              fontSize: 17,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {d.title}
          </div>
          {d.status && <StatusChip status={d.status} />}
        </div>
      </header>

      {/* Content */}
      <div style={{ padding: "var(--vt-space-4)", paddingBottom: 100 }}>
        {/* Metadata card */}
        <div
          style={{
            background: "white",
            borderRadius: "var(--vt-radius)",
            boxShadow: "0 1px 6px rgba(149,97,171,0.08)",
            padding: "var(--vt-space-4)",
            marginBottom: "var(--vt-space-4)",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {d.priority && <MetaChip label={d.priority} />}
          {d.due_date && <MetaChip label={fmtDate(d.due_date)} />}
          {d.points ? <MetaChip label={`+${d.points} pts`} /> : null}
        </div>

        {/* Description card */}
        {d.description && (
          <div
            style={{
              background: "white",
              borderRadius: "var(--vt-radius)",
              boxShadow: "0 1px 6px rgba(149,97,171,0.08)",
              padding: "var(--vt-space-4)",
              marginBottom: "var(--vt-space-4)",
              whiteSpace: "pre-wrap",
            }}
          >
            {d.description}
          </div>
        )}

        {/* Activity card */}
        <div
          style={{
            background: "white",
            borderRadius: "var(--vt-radius)",
            boxShadow: "0 1px 6px rgba(149,97,171,0.08)",
            overflow: "hidden",
            marginBottom: "var(--vt-space-4)",
          }}
        >
          <div
            style={{
              padding: "var(--vt-space-2) var(--vt-space-4)",
              fontSize: 11,
              fontWeight: 700,
              color: "var(--vt-primary)",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              borderBottom: "1px solid var(--vt-border)",
            }}
          >
            Aktivitas
          </div>
          {d.activity.length === 0 && (
            <div style={{ padding: "var(--vt-space-4)", color: "var(--vt-text-muted)" }}>—</div>
          )}
          {d.activity.map((a, idx) => (
            <div key={idx} style={{ padding: "var(--vt-space-3) var(--vt-space-4)", borderTop: idx === 0 ? "none" : "1px solid var(--vt-border)" }}>
              <div style={{ fontSize: 12, color: "var(--vt-text-muted)", marginBottom: 4 }}>
                {a.owner} · {fmtDate(a.creation)} {fmtTime(a.creation)}
              </div>
              <div>{a.content}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky bottom action bar */}
      <div
        style={{
          position: "sticky",
          bottom: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
          padding: 12,
          background: "white",
          borderTop: "1px solid var(--vt-border)",
          boxShadow: "0 -4px 16px rgba(149,97,171,0.08)",
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
