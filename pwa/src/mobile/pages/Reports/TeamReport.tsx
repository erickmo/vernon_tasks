import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchTeamLeaderboard,
  fetchTeamCompletion,
  fetchTeamOverdue,
  fetchTeamWorkload,
  type Period,
} from "../../../api/reports";
import { LeaderboardTable } from "../../../components/LeaderboardTable";
import { Skeleton } from "../../../components/Skeleton";
import { EmptyState } from "../../../components/EmptyState";
import { logEvent } from "../../../telemetry";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "Minggu" },
  { key: "month", label: "Bulan" },
  { key: "quarter", label: "Kuartal" },
];
const VALID_PERIODS: Period[] = ["week", "month", "quarter"];

export function TeamReport() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const rawPeriod = params.get("period") as Period;
  const period: Period = VALID_PERIODS.includes(rawPeriod) ? rawPeriod : "month";

  const lbQ = useQuery({
    queryKey: ["reports", "team", "leaderboard", period],
    queryFn: () => fetchTeamLeaderboard(period, 10),
    staleTime: 60_000,
  });
  const completionQ = useQuery({
    queryKey: ["reports", "team", "completion", period],
    queryFn: () => fetchTeamCompletion(period),
    staleTime: 60_000,
  });
  const overdueQ = useQuery({
    queryKey: ["reports", "team", "overdue"],
    queryFn: () => fetchTeamOverdue(),
    staleTime: 60_000,
  });
  const workloadQ = useQuery({
    queryKey: ["reports", "team", "workload"],
    queryFn: () => fetchTeamWorkload(),
    staleTime: 60_000,
  });

  useEffect(() => {
    logEvent("reports_team_view", {});
  }, []);

  function setPeriod(p: Period) {
    setParams({ period: p }, { replace: true });
    logEvent("reports_period_change", { scope: "team", period: p });
  }

  return (
    <div style={{ background: "var(--vt-primary-light)", flex: 1, display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "var(--vt-primary-light)",
          padding: "var(--vt-space-4)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          onClick={() => nav("/m/reports")}
          aria-label="Back"
          style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "var(--vt-primary-dark)" }}
        >
          ‹
        </button>
        <h1 style={{ margin: 0, color: "var(--vt-primary-dark)", fontSize: 15, fontWeight: 600 }}>My Team</h1>
      </header>
      <div style={{ padding: "var(--vt-space-4)" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: "var(--vt-space-3)" }}>
          {PERIODS.map((p) => {
            const active = p.key === period;
            return (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--vt-border)",
                  background: active ? "var(--vt-primary)" : "transparent",
                  color: active ? "var(--vt-primary-contrast)" : "var(--vt-text)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--vt-text-muted)", margin: "0 0 8px 0", textTransform: "uppercase" }}>
          Leaderboard
        </h2>
        {lbQ.isLoading && <Skeleton height={120} />}
        {lbQ.data && <LeaderboardTable rows={lbQ.data.rows} />}

        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--vt-text-muted)", margin: "var(--vt-space-4) 0 8px 0", textTransform: "uppercase" }}>
          Completion
        </h2>
        {completionQ.isLoading && <Skeleton height={64} />}
        {completionQ.data && (
          <div style={{ padding: 16, background: "white", borderRadius: 12, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--vt-primary-dark)" }}>
              {completionQ.data.completion_pct}%
            </div>
            <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>
              {completionQ.data.done} / {completionQ.data.total} selesai
            </div>
          </div>
        )}

        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--vt-text-muted)", margin: "var(--vt-space-4) 0 8px 0", textTransform: "uppercase" }}>
          Overdue
        </h2>
        {overdueQ.isLoading && <Skeleton height={80} />}
        {overdueQ.data && overdueQ.data.total === 0 && <EmptyState title="Tidak ada task overdue." />}
        {overdueQ.data &&
          overdueQ.data.items.map((it) => (
            <div key={it.name} style={{ padding: 12, marginBottom: 8, background: "white", borderRadius: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{it.subject}</div>
              <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>
                {it.assignee} · due {it.due_date}
              </div>
            </div>
          ))}

        <h2 style={{ fontSize: 13, fontWeight: 600, color: "var(--vt-text-muted)", margin: "var(--vt-space-4) 0 8px 0", textTransform: "uppercase" }}>
          Workload
        </h2>
        {workloadQ.isLoading && <Skeleton height={120} />}
        {workloadQ.data &&
          workloadQ.data.members.map((m) => (
            <div
              key={m.user}
              style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: "white", borderRadius: 8, marginBottom: 6 }}
            >
              <div style={{ flex: 1, fontSize: 13 }}>{m.user}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{m.open_tasks}</div>
            </div>
          ))}
      </div>
    </div>
  );
}
