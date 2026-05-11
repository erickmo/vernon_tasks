import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchMyWork, TaskCard as TaskCardT } from "../../api/tasks";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { StaleBadge } from "../../components/StaleBadge";
import { PullToRefresh } from "../../components/PullToRefresh";
import { greeting, fmtDate, t } from "../../i18n";

function TaskCardView({ task, accent }: { task: TaskCardT; accent?: string }) {
  return (
    <Link
      to={`/m/work/${encodeURIComponent(task.id)}`}
      style={{
        display: "block",
        padding: "var(--vt-space-4)",
        marginBottom: "var(--vt-space-3)",
        background: "var(--vt-surface)",
        borderRadius: "var(--vt-radius)",
        borderLeft: accent ? `3px solid ${accent}` : undefined,
        color: "var(--vt-text)",
        textDecoration: "none",
        boxShadow: "var(--vt-shadow)",
      }}
    >
      <div style={{ fontWeight: 600 }}>{task.title}</div>
      <div style={{ fontSize: 13, color: "var(--vt-text-muted)", marginTop: 4 }}>
        {[task.project, task.priority].filter(Boolean).join(" · ")}
        {task.points ? ` · +${task.points} pts` : ""}
      </div>
    </Link>
  );
}

function Section({
  title,
  items,
  accent,
}: {
  title: string;
  items: TaskCardT[];
  accent?: string;
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
        <TaskCardView key={task.id} task={task} accent={accent} />
      ))}
    </section>
  );
}

export function MyWorkList() {
  const q = useQuery({ queryKey: ["my-work"], queryFn: fetchMyWork });

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
                accent="var(--vt-danger)"
              />
              <Section
                title={t("tasks.section.today")}
                items={q.data.today}
                accent="var(--vt-primary)"
              />
              <Section title={t("tasks.section.upcoming")} items={q.data.upcoming} />
            </>
          ))}
      </div>
    </PullToRefresh>
  );
}
