import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchMyWork, MyWork, TaskCard as TaskCardT } from "../../api/tasks";
import { completeTask, logProgress, snoozeTask, SnoozeDays } from "../../api/mutations";
import {
  fetchSearchResults,
  filtersActive,
  SearchFilters,
} from "../../api/search";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { StaleBadge } from "../../components/StaleBadge";
import { PullToRefresh } from "../../components/PullToRefresh";
import { SwipeRow } from "../../components/SwipeRow";
import { TaskActions } from "../../components/TaskActions";
import { LogProgressModal } from "../../components/LogProgressModal";
import { InstallPrompt } from "../../components/InstallPrompt";
import { SearchBar } from "../../components/SearchBar";
import { FilterSheet } from "../../components/FilterSheet";
import { ActiveFilterChips } from "../../components/ActiveFilterChips";
import { useToast } from "../../components/Toast";
import { useUndoableMutation } from "../../hooks/useUndoableMutation";
import { useCompleteCounter } from "../../hooks/useCompleteCounter";
import { useDebounce } from "../../hooks/useDebounce";
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
  accent,
  render,
}: {
  title: string;
  items: TaskCardT[];
  accent?: string;
  render: (task: TaskCardT) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section style={{ marginBottom: "var(--vt-space-5)" }}>
      <h3
        style={{
          fontSize: 11,
          color: accent ?? "var(--vt-text-muted)",
          margin: "0 0 var(--vt-space-2)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontWeight: 700,
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

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({ due_range: "all" });
  const [filterOpen, setFilterOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const combinedFilters: SearchFilters = { ...filters, query: debouncedQuery };
  const searching = filtersActive(combinedFilters);

  const searchQ = useQuery({
    queryKey: ["my-work-search", combinedFilters],
    queryFn: () => fetchSearchResults(combinedFilters),
    enabled: searching,
  });

  function removeFilter(key: keyof SearchFilters, value?: string) {
    setFilters((prev) => {
      const next = { ...prev };
      if (key === "priority" && value) {
        next.priority = (prev.priority ?? []).filter((p) => p !== value);
      } else if (key === "project") {
        next.project = undefined;
      } else if (key === "due_range") {
        next.due_range = "all";
      }
      return next;
    });
  }

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
      {/* ── Sticky gradient header ── */}
      <header
        style={{
          background: "linear-gradient(135deg, #2d1540, #9561ab)",
          padding: "var(--vt-space-4) var(--vt-space-4) var(--vt-space-3)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginBottom: 2 }}>
          {fmtDate(new Date())}
        </div>
        <div style={{ color: "white", fontSize: 18, fontWeight: 700 }}>
          {greeting()}
        </div>

        {/* Filter chips — display only */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
            overflowX: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          } as React.CSSProperties}
        >
          <button
            onClick={() => { setQuery(""); setFilters({ due_range: "all" }); }}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              borderRadius: 20,
              padding: "4px 12px",
              color: "white",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Semua
          </button>
          {q.data && q.data.overdue.length > 0 && (
            <span
              style={{
                background: "rgba(212,53,28,0.25)",
                border: "1px solid rgba(212,53,28,0.4)",
                borderRadius: 20,
                padding: "4px 12px",
                color: "rgba(255,200,200,0.9)",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              {`Terlambat ${q.data.overdue.length}`}
            </span>
          )}
          {q.data && q.data.today.length > 0 && (
            <span
              style={{
                background: "rgba(255,255,255,0.1)",
                borderRadius: 20,
                padding: "4px 12px",
                color: "rgba(255,255,255,0.8)",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              {`Hari ini ${q.data.today.length}`}
            </span>
          )}
          <StaleBadge resource="my-work" />
        </div>
      </header>

      {/* ── Sticky search strip ── */}
      <div
        style={{
          background: "white",
          padding: "var(--vt-space-2) var(--vt-space-4)",
          borderBottom: "1px solid var(--vt-primary-light)",
          position: "sticky",
          top: 96,
          zIndex: 9,
        }}
      >
        <SearchBar
          value={query}
          onChange={(v) => {
            setQuery(v);
            if (v.length > 0) logEvent("search_query", { query_length: v.length });
          }}
          onOpenFilter={() => setFilterOpen(true)}
          filterActive={Boolean(
            (filters.priority && filters.priority.length > 0) ||
              filters.project ||
              (filters.due_range && filters.due_range !== "all"),
          )}
        />
        <ActiveFilterChips filters={combinedFilters} onRemove={removeFilter} />
      </div>

      {/* ── Task content ── */}
      <div style={{ padding: "var(--vt-space-4)", background: "var(--vt-primary-light)", minHeight: "100%" }}>
        {!searching && q.isLoading && (
          <>
            <Skeleton height={64} />
            <div style={{ height: 12 }} />
            <Skeleton height={64} />
          </>
        )}

        {!searching && q.isError && !q.data && (
          <EmptyState
            title={t("empty.no_offline")}
            cta={{ label: t("common.retry"), onClick: () => q.refetch() }}
          />
        )}

        {!searching &&
          q.data &&
          (total === 0 ? (
            <EmptyState title={t("empty.no_tasks")} />
          ) : (
            <>
              <Section
                title={t("tasks.section.overdue")}
                items={q.data.overdue}
                accent="var(--vt-danger)"
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
                accent="var(--vt-primary)"
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
                accent="var(--vt-border)"
                render={(task) => (
                  <TaskCardView
                    task={task}
                    accent="var(--vt-border)"
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    disabled={offline}
                  />
                )}
              />
            </>
          ))}

        {searching && searchQ.isLoading && (
          <>
            <Skeleton height={64} />
            <div style={{ height: 12 }} />
            <Skeleton height={64} />
          </>
        )}

        {searching && searchQ.isError && (
          <EmptyState
            title={t("search.failed")}
            cta={{ label: t("common.retry"), onClick: () => searchQ.refetch() }}
          />
        )}

        {searching && searchQ.data && (
          searchQ.data.results.length === 0 ? (
            <EmptyState title={t("search.no_results")} />
          ) : (
            <div>
              {searchQ.data.results.map((task) => (
                <div key={task.id} style={{ marginBottom: "var(--vt-space-3)" }}>
                  <TaskCardView
                    task={task}
                    accent="var(--vt-border)"
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    disabled={offline}
                  />
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <FilterSheet
        open={filterOpen}
        initial={filters}
        onApply={(f) => {
          setFilters(f);
          setFilterOpen(false);
          logEvent("filter_applied", {
            priority_count: f.priority?.length ?? 0,
            has_project: !!f.project,
            due_range: f.due_range ?? "all",
          });
        }}
        onCancel={() => setFilterOpen(false)}
      />

      <LogProgressModal
        open={logTask !== null}
        onSubmit={(h, n) => logTask && handleLog(logTask, h, n)}
        onCancel={() => setLogTask(null)}
      />

      <InstallPrompt visible={ready} />
    </PullToRefresh>
  );
}
