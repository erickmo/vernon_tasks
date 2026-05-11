import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchMyWork, MyWork, TaskCard as TaskCardT } from "../../api/tasks";
import { completeTask, logProgress, snoozeTask, SnoozeDays } from "../../api/mutations";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { StaleBadge } from "../../components/StaleBadge";
import { PullToRefresh } from "../../components/PullToRefresh";
import { SwipeRow } from "../../components/SwipeRow";
import { TaskActions } from "../../components/TaskActions";
import { LogProgressModal } from "../../components/LogProgressModal";
import { InstallPrompt } from "../../components/InstallPrompt";
import { useToast } from "../../components/Toast";
import { useUndoableMutation } from "../../hooks/useUndoableMutation";
import { useCompleteCounter } from "../../hooks/useCompleteCounter";
import { greeting, fmtDate, t } from "../../i18n";
import { logEvent } from "../../telemetry";

function TaskCardView({
  task,
  accent,
  onComplete,
  onLog,
  onSnooze,
  disabled,
}: {
  task: TaskCardT;
  accent?: string;
  onComplete: () => void;
  onLog: () => void;
  onSnooze: () => void;
  disabled: boolean;
}) {
  return (
    <SwipeRow
      actions={
        <TaskActions
          onComplete={onComplete}
          onLog={onLog}
          onSnooze={onSnooze}
          disabled={disabled}
        />
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "var(--vt-space-4)",
          background: "var(--vt-surface)",
          borderRadius: "var(--vt-radius)",
          borderLeft: accent ? `3px solid ${accent}` : undefined,
          boxShadow: "var(--vt-shadow)",
        }}
      >
        <input
          type="checkbox"
          checked={false}
          onChange={onComplete}
          disabled={disabled}
          aria-label="complete"
          style={{ width: 22, height: 22 }}
        />
        <Link
          to={`/m/work/${encodeURIComponent(task.id)}`}
          style={{ flex: 1, color: "var(--vt-text)", textDecoration: "none" }}
        >
          <div style={{ fontWeight: 600 }}>{task.title}</div>
          <div style={{ fontSize: 13, color: "var(--vt-text-muted)", marginTop: 4 }}>
            {[task.project, task.priority].filter(Boolean).join(" · ")}
            {task.points ? ` · +${task.points} pts` : ""}
          </div>
        </Link>
      </div>
    </SwipeRow>
  );
}

function Section({
  title,
  items,
  render,
}: {
  title: string;
  items: TaskCardT[];
  render: (task: TaskCardT) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section style={{ marginBottom: "var(--vt-space-5)" }}>
      <h3
        style={{
          fontSize: 14,
          color: "var(--vt-text-muted)",
          margin: "0 0 var(--vt-space-3)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {title}
      </h3>
      {items.map((task) => (
        <div key={task.id} style={{ marginBottom: "var(--vt-space-3)" }}>
          {render(task)}
        </div>
      ))}
    </section>
  );
}

export function MyWorkList() {
  const q = useQuery({ queryKey: ["my-work"], queryFn: fetchMyWork });
  const qc = useQueryClient();
  const { show } = useToast();
  const { increment, ready } = useCompleteCounter();
  const [logTask, setLogTask] = useState<TaskCardT | null>(null);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  function removeFromCache(taskId: string): MyWork | undefined {
    const prev = qc.getQueryData<MyWork>(["my-work"]);
    if (!prev) return undefined;
    const next: MyWork = {
      overdue: prev.overdue.filter((x) => x.id !== taskId),
      today: prev.today.filter((x) => x.id !== taskId),
      upcoming: prev.upcoming.filter((x) => x.id !== taskId),
    };
    qc.setQueryData(["my-work"], next);
    return prev;
  }

  const completeUndoable = useUndoableMutation(async (taskId: string) => {
    try {
      await completeTask(taskId);
      logEvent("task_complete", { task_id: taskId });
      increment();
      qc.invalidateQueries({ queryKey: ["my-work"] });
    } catch {
      qc.invalidateQueries({ queryKey: ["my-work"] });
      show(t("actions.failed"));
    }
  }, 5000);

  function handleComplete(task: TaskCardT) {
    if (offline) {
      show(t("actions.offline"));
      return;
    }
    const prev = removeFromCache(task.id);
    show(t("actions.completed_toast"), {
      label: t("actions.undo"),
      onClick: () => {
        completeUndoable.cancel();
        if (prev) qc.setQueryData(["my-work"], prev);
        logEvent("task_complete_undone", { task_id: task.id });
      },
    });
    completeUndoable.trigger(task.id);
  }

  async function handleLog(task: TaskCardT, hours: number, note: string) {
    setLogTask(null);
    if (offline) {
      show(t("actions.offline"));
      return;
    }
    try {
      await logProgress(task.id, hours, note);
      logEvent("task_log", { task_id: task.id, hours });
      show(t("actions.logged_toast"));
    } catch {
      show(t("actions.failed"));
    }
  }

  async function handleSnooze(task: TaskCardT, days: SnoozeDays) {
    if (offline) {
      show(t("actions.offline"));
      return;
    }
    try {
      await snoozeTask(task.id, days);
      logEvent("task_snooze", { task_id: task.id, days });
      show(t("actions.snoozed_toast"));
      qc.invalidateQueries({ queryKey: ["my-work"] });
    } catch {
      show(t("actions.failed"));
    }
  }

  const total =
    (q.data?.overdue.length ?? 0) +
    (q.data?.today.length ?? 0) +
    (q.data?.upcoming.length ?? 0);

  return (
    <PullToRefresh onRefresh={() => q.refetch().then(() => {})}>
      <div style={{ padding: "var(--vt-space-4)" }}>
        <header style={{ marginBottom: "var(--vt-space-4)" }}>
          <h1 style={{ margin: 0 }}>{greeting()}</h1>
          <div
            style={{
              color: "var(--vt-text-muted)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 4,
            }}
          >
            <span>{fmtDate(new Date())}</span>
            <StaleBadge resource="my-work" />
          </div>
        </header>

        {q.isLoading && (
          <>
            <Skeleton height={64} />
            <div style={{ height: 12 }} />
            <Skeleton height={64} />
          </>
        )}

        {q.isError && !q.data && (
          <EmptyState
            title={t("empty.no_offline")}
            cta={{ label: t("common.retry"), onClick: () => q.refetch() }}
          />
        )}

        {q.data &&
          (total === 0 ? (
            <EmptyState title={t("empty.no_tasks")} />
          ) : (
            <>
              <Section
                title={t("tasks.section.overdue")}
                items={q.data.overdue}
                render={(task) => (
                  <TaskCardView
                    task={task}
                    accent="var(--vt-danger)"
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    disabled={offline}
                  />
                )}
              />
              <Section
                title={t("tasks.section.today")}
                items={q.data.today}
                render={(task) => (
                  <TaskCardView
                    task={task}
                    accent="var(--vt-primary)"
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    disabled={offline}
                  />
                )}
              />
              <Section
                title={t("tasks.section.upcoming")}
                items={q.data.upcoming}
                render={(task) => (
                  <TaskCardView
                    task={task}
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    disabled={offline}
                  />
                )}
              />
            </>
          ))}
      </div>

      <LogProgressModal
        open={logTask !== null}
        onSubmit={(h, n) => logTask && handleLog(logTask, h, n)}
        onCancel={() => setLogTask(null)}
      />

      <InstallPrompt visible={ready} />
    </PullToRefresh>
  );
}
