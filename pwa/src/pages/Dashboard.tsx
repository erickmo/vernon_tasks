import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchEmployeeStats,
  fetchSprintKanban,
} from "../api/dashboard";
import { SummaryCard } from "../components/SummaryCard";
import { ProgressBar } from "../components/ProgressBar";
import { KanbanColumn } from "../components/KanbanColumn";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { PullToRefresh } from "../components/PullToRefresh";
import { fmtDate, t } from "../i18n";
import { logEvent } from "../telemetry";

const ACCENTS: Record<string, string> = {
  Backlog: "var(--vt-text-muted)",
  Doing: "var(--vt-primary)",
  Review: "var(--vt-warn)",
  Done: "var(--vt-success)",
};

export function DashboardPage() {
  useEffect(() => {
    logEvent("dashboard_view", {});
  }, []);

  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchEmployeeStats,
    staleTime: 60_000,
  });
  const kanban = useQuery({
    queryKey: ["dashboard-kanban"],
    queryFn: fetchSprintKanban,
    staleTime: 60_000,
  });

  async function refresh() {
    await Promise.all([stats.refetch(), kanban.refetch()]);
  }

  return (
    <PullToRefresh onRefresh={refresh}>
      <div style={{ padding: "var(--vt-space-4)" }}>
        <h1 style={{ marginTop: 0 }}>{t("nav.dashboard")}</h1>

        {stats.isLoading && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              marginBottom: "var(--vt-space-4)",
            }}
          >
            <Skeleton height={88} />
            <Skeleton height={88} />
            <Skeleton height={88} />
          </div>
        )}

        {stats.data && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              marginBottom: "var(--vt-space-4)",
            }}
          >
            <SummaryCard
              icon="✅"
              label="Selesai hari ini"
              value={stats.data.done_today}
              accent="var(--vt-success)"
            />
            <SummaryCard
              icon="📅"
              label="Minggu ini"
              value={stats.data.done_week}
              accent="var(--vt-primary)"
            />
            <SummaryCard
              icon="⭐"
              label="Poin bulan ini"
              value={Math.round(stats.data.points_month)}
              accent="var(--vt-warn)"
            />
          </div>
        )}

        {kanban.isLoading && <Skeleton height={120} />}

        {kanban.data && (
          kanban.data.sprint ? (
            <>
              <section
                style={{
                  padding: "var(--vt-space-4)",
                  background: "var(--vt-surface)",
                  borderRadius: "var(--vt-radius)",
                  marginBottom: "var(--vt-space-4)",
                  boxShadow: "var(--vt-shadow)",
                }}
              >
                <div style={{ fontSize: 13, color: "var(--vt-text-muted)" }}>Sprint Aktif</div>
                <div style={{ fontSize: 18, fontWeight: 700, margin: "4px 0 8px" }}>
                  {kanban.data.sprint.title}
                </div>
                <ProgressBar
                  pct={kanban.data.sprint.progress_pct}
                  label={`${fmtDate(kanban.data.sprint.start_date)} — ${fmtDate(
                    kanban.data.sprint.end_date,
                  )}`}
                />
              </section>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  overflowX: "auto",
                  paddingBottom: 8,
                  marginLeft: "calc(-1 * var(--vt-space-4))",
                  marginRight: "calc(-1 * var(--vt-space-4))",
                  paddingLeft: "var(--vt-space-4)",
                  paddingRight: "var(--vt-space-4)",
                }}
              >
                {Object.entries(kanban.data.columns).map(([title, items]) => (
                  <KanbanColumn
                    key={title}
                    title={title}
                    items={items}
                    accent={ACCENTS[title]}
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyState title="Belum ada sprint aktif" body="Sprint akan muncul saat tim memulai sprint baru." />
          )
        )}

        {(stats.isError || kanban.isError) && !stats.data && !kanban.data && (
          <EmptyState
            title={t("empty.no_offline")}
            cta={{ label: t("common.retry"), onClick: refresh }}
          />
        )}
      </div>
    </PullToRefresh>
  );
}
