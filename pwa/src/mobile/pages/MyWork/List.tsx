import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { useOnline } from "../../../hooks/useOnline";
import { enqueue } from "../../../cache/outbox";
import { MyWorkDetail } from "./Detail";
import { fetchMyWork, MyWork, TaskCard as TaskCardT } from "../../../api/tasks";
import { completeTask, logProgress, snoozeTask, SnoozeDays } from "../../../api/mutations";
import {
  fetchSearchResults,
  filtersActive,
  SearchFilters,
} from "../../../api/search";
import { Skeleton } from "../../../components/Skeleton";
import { EmptyState } from "../../../components/EmptyState";
import { StaleBadge } from "../../../components/StaleBadge";
import { PullToRefresh } from "../../../components/PullToRefresh";
import { SwipeRow } from "../../../components/SwipeRow";
import { TaskActions } from "../../../components/TaskActions";
import { LogProgressModal } from "../../../components/LogProgressModal";
import { InstallPrompt } from "../../../components/InstallPrompt";
import { SearchBar } from "../../../components/SearchBar";
import { FilterSheet } from "../../../components/FilterSheet";
import { ActiveFilterChips } from "../../../components/ActiveFilterChips";
import { useToast } from "../../../components/Toast";
import { useUndoableMutation } from "../../../hooks/useUndoableMutation";
import { useCompleteCounter } from "../../../hooks/useCompleteCounter";
import { useDebounce } from "../../../hooks/useDebounce";
import { t } from "../../../i18n";
import { logEvent } from "../../../telemetry";
import { ProjectFormModal } from "../../../components/ProjectFormModal";
import { QuickAddTaskModal } from "../../../components/QuickAddTaskModal";
import { createProject } from "../../../portal/projects/api/projects";
import { projectKeys } from "../../../portal/projects/hooks/keys";
import { useProjects } from "../../../portal/projects/hooks/useProjects";

/* ── Tokens (match Dashboard) ─────────────────────────────── */
const BG     = "#f1f5f9";
const CARD   = "#ffffff";
const SHADOW = "0 1px 3px rgba(0,0,0,0.07), 0 2px 10px rgba(0,0,0,0.04)";
const BD     = "#e8edf3";
const TEXT   = "#0f172a";
const TEXT2  = "#64748b";
const TEXT3  = "#94a3b8";
const INDIGO = "#4f46e5";
const DANGER = "#dc2626";
const AMBER  = "#d97706";

const HEADER_H = 84;

interface WorkListHeaderProps {
  data: MyWork | undefined;
  onResetFilters: () => void;
  filtersActive: boolean;
}

function WorkListHeader({ data, onResetFilters, filtersActive }: WorkListHeaderProps) {
  const todayStr = new Date().toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long",
  });
  const [showCreate, setShowCreate] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const qc = useQueryClient();
  const { data: projectRows = [] } = useProjects({});
  const quickAddProjects = projectRows.map(p => ({ name: p.name, title: p.title }));

  async function handleCreateProject(values: { title: string; status: string }) {
    await createProject({ title: values.title, status: values.status });
    setShowCreate(false);
    qc.invalidateQueries({ queryKey: projectKeys.lists() });
  }

  return (
    <header
      style={{
        background: CARD,
        borderBottom: `1px solid ${BD}`,
        padding: "20px 20px 14px",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <p style={{
        margin: "0 0 2px", fontSize: 10,
        color: TEXT3, fontWeight: 500,
        letterSpacing: "0.04em",
      }}>
        {todayStr}
      </p>
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 8,
      }}>
        <h1 style={{
          margin: 0, fontSize: 20, fontWeight: 700,
          letterSpacing: "-0.02em", color: TEXT,
        }}>
          Pekerjaan Saya
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => { logEvent("quick_add_task_open", {}); setShowQuickAdd(true); }}
            aria-label="Tugas Baru"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              color: INDIGO,
              border: `1px solid ${BD}`,
              borderRadius: 99,
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            + Tugas
          </button>
          <button
            onClick={() => { logEvent("project_create_click", {}); setShowCreate(true); }}
            aria-label="Buat Proyek"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: INDIGO,
              color: "#ffffff",
              borderRadius: 99,
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1,
              border: "none",
              cursor: "pointer",
            }}
          >
            + Proyek
          </button>
          <a
            href="/app/vt-project"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => logEvent("project_manage_click", {})}
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "transparent",
              color: INDIGO,
              border: `1px solid ${BD}`,
              borderRadius: 99,
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              textDecoration: "none",
              lineHeight: 1,
            }}
            aria-label="Kelola Proyek"
          >
            Kelola
          </a>
          <StaleBadge resource="my-work" />
        </div>
      </div>

      {/* Summary chips (tap-to-reset filter) */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 12,
          overflowX: "auto",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        } as React.CSSProperties}
      >
        <button
          onClick={onResetFilters}
          aria-pressed={!filtersActive}
          style={{
            background: !filtersActive ? "#eef2ff" : "transparent",
            border: `1px solid ${!filtersActive ? "#c7d2fe" : BD}`,
            borderRadius: 99,
            padding: "4px 12px",
            color: !filtersActive ? INDIGO : TEXT2,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {t("header.filter.all")}
        </button>
        {data && data.overdue.length > 0 && (
          <span
            style={{
              background: "#fef2f2",
              border: `1px solid #fecaca`,
              borderRadius: 99,
              padding: "4px 10px",
              color: DANGER,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {`${t("header.filter.overdue")} ${data.overdue.length}`}
          </span>
        )}
        {data && data.today.length > 0 && (
          <span
            style={{
              background: "#fffbeb",
              border: `1px solid #fde68a`,
              borderRadius: 99,
              padding: "4px 10px",
              color: AMBER,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {`${t("header.filter.today")} ${data.today.length}`}
          </span>
        )}
      </div>

      {showCreate && (
        <ProjectFormModal
          mode="create"
          onSave={handleCreateProject}
          onCancel={() => setShowCreate(false)}
        />
      )}
      {showQuickAdd && (
        <QuickAddTaskModal
          projects={quickAddProjects}
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => {
            setShowQuickAdd(false);
            qc.invalidateQueries({ queryKey: ["my-work"] });
          }}
        />
      )}
    </header>
  );
}

function TaskCardView({
  task,
  accent,
  onComplete,
  onLog,
  onSnooze,
  onSelect,
  disabled,
}: {
  task: TaskCardT;
  accent?: string;
  onComplete: () => void;
  onLog: () => void;
  onSnooze: () => void;
  onSelect?: () => void;
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
        data-testid="task-card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          background: CARD,
          borderRadius: 10,
          borderLeft: accent ? `3px solid ${accent}` : undefined,
          boxShadow: SHADOW,
        }}
      >
        <input
          type="checkbox"
          checked={false}
          onChange={onComplete}
          disabled={disabled}
          aria-label="complete"
          style={{ width: 20, height: 20, accentColor: INDIGO }}
        />
        {onSelect ? (
          <div
            onClick={onSelect}
            style={{ flex: 1, color: TEXT, cursor: "pointer" }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.35 }}>{task.title}</div>
            <div style={{ fontSize: 11, color: TEXT2, marginTop: 4 }}>
              {[task.project, task.priority].filter(Boolean).join(" · ")}
              {task.points ? ` · +${task.points} pts` : ""}
            </div>
          </div>
        ) : (
          <Link
            to={`/m/work/${encodeURIComponent(task.id)}`}
            style={{ flex: 1, color: TEXT, textDecoration: "none" }}
          >
            <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.35 }}>{task.title}</div>
            <div style={{ fontSize: 11, color: TEXT2, marginTop: 4 }}>
              {[task.project, task.priority].filter(Boolean).join(" · ")}
              {task.points ? ` · +${task.points} pts` : ""}
            </div>
          </Link>
        )}
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
    <section style={{ marginBottom: 20 }}>
      <h3
        style={{
          fontSize: 10,
          color: accent ?? TEXT3,
          margin: "0 0 10px",
          textTransform: "uppercase",
          letterSpacing: "0.10em",
          fontWeight: 700,
        }}
      >
        {title}
      </h3>
      {items.map((task) => (
        <div key={task.id} style={{ marginBottom: 10 }}>
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
  const online = useOnline();
  const offline = !online;
  const isDesktop = useMediaQuery(768);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      // Queue the mutation; it replays via the outbox runner on reconnect.
      void enqueue("complete", { task_id: task.id });
      logEvent("outbox_enqueue", { kind: "complete" });
      removeFromCache(task.id);
      show(t("actions.queued"));
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
      await enqueue("log_progress", { task_id: task.id, hours, note });
      logEvent("outbox_enqueue", { kind: "log_progress" });
      show(t("actions.queued"));
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
      await enqueue("snooze", { task_id: task.id, days });
      logEvent("outbox_enqueue", { kind: "snooze" });
      show(t("actions.queued"));
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
    <div style={{ display: "flex", height: "100%", minHeight: "100vh", background: BG }}>
      {/* List panel */}
      <div style={{
        width: isDesktop ? 380 : "100%",
        minWidth: isDesktop ? 380 : undefined,
        flexShrink: 0,
        borderRight: isDesktop ? `1px solid ${BD}` : undefined,
        overflowY: "auto",
        background: BG,
      }}>
    <PullToRefresh onRefresh={() => q.refetch().then(() => {})}>
      {/* ── Sticky hero ── */}
      <WorkListHeader
        data={q.data}
        filtersActive={searching}
        onResetFilters={() => { setQuery(""); setFilters({ due_range: "all" }); }}
      />

      {/* ── Sticky search strip ── */}
      <div
        style={{
          background: CARD,
          padding: "8px 14px 10px",
          borderBottom: `1px solid ${BD}`,
          position: "sticky",
          top: HEADER_H,
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
      <div style={{ padding: "16px 14px 32px", background: BG, minHeight: "100%" }}>
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
                accent={DANGER}
                render={(task) => (
                  <TaskCardView
                    task={task}
                    accent={DANGER}
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    onSelect={isDesktop ? () => setSelectedId(task.id) : undefined}
                    disabled={false}
                  />
                )}
              />
              <Section
                title={t("tasks.section.today")}
                items={q.data.today}
                accent={INDIGO}
                render={(task) => (
                  <TaskCardView
                    task={task}
                    accent={INDIGO}
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    onSelect={isDesktop ? () => setSelectedId(task.id) : undefined}
                    disabled={false}
                  />
                )}
              />
              <Section
                title={t("tasks.section.upcoming")}
                items={q.data.upcoming}
                accent={BD}
                render={(task) => (
                  <TaskCardView
                    task={task}
                    accent={BD}
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    onSelect={isDesktop ? () => setSelectedId(task.id) : undefined}
                    disabled={false}
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
                <div key={task.id} style={{ marginBottom: 10 }}>
                  <TaskCardView
                    task={task}
                    accent={BD}
                    onComplete={() => handleComplete(task)}
                    onLog={() => setLogTask(task)}
                    onSnooze={() => handleSnooze(task, 1)}
                    onSelect={isDesktop ? () => setSelectedId(task.id) : undefined}
                    disabled={false}
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
      </div>

      {/* Detail panel — desktop only */}
      {isDesktop && (
        <div style={{ flex: 1, overflowY: "auto", background: BG }}>
          {selectedId ? (
            <MyWorkDetail desktopId={selectedId} />
          ) : (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              minHeight: 400,
              color: TEXT2,
              fontSize: 14,
            }}>
              Pilih task untuk melihat detail
            </div>
          )}
        </div>
      )}
    </div>
  );
}
