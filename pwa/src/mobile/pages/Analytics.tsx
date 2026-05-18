import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchLeaderboard,
  fetchVelocity,
  fetchStreak,
  Period,
} from "../../api/analytics";
import { fetchDailyCompletions } from "../../api/dashboard";
import { Tabs } from "../../components/Tabs";
import { LeaderboardTable } from "../../components/LeaderboardTable";
import { VelocityChart } from "../../components/VelocityChart";
import { StreakChart } from "../../components/StreakChart";
import { ProjectPicker } from "../../components/ProjectPicker";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { useUserProjects } from "../../hooks/useUserProjects";
import { t } from "../../i18n";
import { logEvent } from "../../telemetry";

type TabKey = "leaderboard" | "velocity" | "streak";

const TABS = [
  { key: "leaderboard", label: "Leaderboard" },
  { key: "velocity", label: "Velocity" },
  { key: "streak", label: "Streak" },
];

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "Minggu" },
  { key: "month", label: "Bulan" },
  { key: "quarter", label: "Kuartal" },
];

function PeriodChips({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: "var(--vt-space-3)" }}>
      {PERIODS.map((p) => {
        const active = p.key === value;
        return (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
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
  );
}

function LeaderboardTab() {
  const [period, setPeriod] = useState<Period>("month");
  const q = useQuery({
    queryKey: ["leaderboard", period],
    queryFn: () => fetchLeaderboard(period, 10),
    staleTime: 60_000,
  });

  return (
    <div>
      <PeriodChips
        value={period}
        onChange={(p) => {
          setPeriod(p);
          logEvent("analytics_period_change", { period: p });
        }}
      />
      {q.isLoading && <Skeleton height={64} />}
      {q.isError && (
        <EmptyState
          title={t("empty.no_offline")}
          cta={{ label: t("common.retry"), onClick: () => q.refetch() }}
        />
      )}
      {q.data && <LeaderboardTable rows={q.data} />}
    </div>
  );
}

function VelocityTab() {
  const { projects, isLoading } = useUserProjects();
  const [project, setProject] = useState("");
  const effective = project || projects[0] || "";

  const q = useQuery({
    queryKey: ["velocity", effective],
    queryFn: () => fetchVelocity(effective, 6),
    enabled: Boolean(effective),
    staleTime: 60_000,
  });

  return (
    <div>
      <ProjectPicker
        projects={projects}
        value={effective}
        onChange={(p) => {
          setProject(p);
          logEvent("analytics_project_change", { project: p });
        }}
        loading={isLoading}
      />
      {!effective && !isLoading && null}
      {q.isLoading && <Skeleton height={240} />}
      {q.isError && (
        <EmptyState
          title={t("empty.no_offline")}
          cta={{ label: t("common.retry"), onClick: () => q.refetch() }}
        />
      )}
      {q.data && (
        <>
          <VelocityChart data={q.data} />
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--vt-text-muted)" }}>
            Rata-rata Anda: <strong style={{ color: "var(--vt-text)" }}>{q.data.avg.toFixed(1)}</strong> · Tim:{" "}
            <strong style={{ color: "var(--vt-text)" }}>{q.data.team_avg_total.toFixed(1)}</strong>
          </div>
        </>
      )}
    </div>
  );
}

function StreakTab() {
  const { projects, isLoading } = useUserProjects();
  const [project, setProject] = useState("");
  const effective = project || projects[0] || "";

  const streakQ = useQuery({
    queryKey: ["streak", effective],
    queryFn: () => fetchStreak(effective),
    enabled: Boolean(effective),
    staleTime: 60_000,
  });
  const dailyQ = useQuery({
    queryKey: ["daily-completions"],
    queryFn: fetchDailyCompletions,
    staleTime: 60_000,
  });

  return (
    <div>
      <ProjectPicker
        projects={projects}
        value={effective}
        onChange={(p) => {
          setProject(p);
          logEvent("analytics_project_change", { project: p });
        }}
        loading={isLoading}
      />
      {streakQ.data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 8,
            marginBottom: "var(--vt-space-4)",
          }}
        >
          <div
            style={{
              padding: "var(--vt-space-4)",
              background: "white",
              borderRadius: "var(--vt-radius)",
              boxShadow: "0 1px 6px rgba(149,97,171,0.08)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700 }}>{streakQ.data.streak}</div>
            <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>Streak sprint</div>
          </div>
          <div
            style={{
              padding: "var(--vt-space-4)",
              background: "white",
              borderRadius: "var(--vt-radius)",
              boxShadow: "0 1px 6px rgba(149,97,171,0.08)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700 }}>{streakQ.data.sprints_checked}</div>
            <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>Sprint dicek</div>
          </div>
        </div>
      )}
      <div style={{ fontSize: 13, color: "var(--vt-text-muted)", marginBottom: 8 }}>
        Penyelesaian 7 hari terakhir
      </div>
      {dailyQ.isLoading && <Skeleton height={200} />}
      {dailyQ.data && <StreakChart data={dailyQ.data} />}
    </div>
  );
}

const VALID_TABS: TabKey[] = ["leaderboard", "velocity", "streak"];

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab") as TabKey;
  const tab = VALID_TABS.includes(rawTab) ? rawTab : "leaderboard";
  function setTab(k: TabKey) {
    setParams({ tab: k }, { replace: true });
  }

  useEffect(() => {
    logEvent("analytics_view", { tab });
  }, [tab]);

  return (
    <div style={{ background: "var(--vt-primary-light)", minHeight: "100%" }}>
      {/* Sticky gradient header */}
      <header
        style={{
          background: "var(--vt-primary-light)",
          padding: "var(--vt-space-4)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <h1 style={{ margin: 0, color: "var(--vt-primary-dark)", fontSize: 15, fontWeight: 600 }}>
          {t("nav.analytics")}
        </h1>
      </header>

      {/* Tabs — sticky below header */}
      <div
        style={{
          position: "sticky",
          top: 64,
          background: "white",
          zIndex: 9,
          borderBottom: "1px solid var(--vt-border)",
          padding: "0 var(--vt-space-4)",
        }}
      >
        <Tabs tabs={TABS} active={tab} onChange={(k) => setTab(k as TabKey)} />
      </div>

      {/* Content */}
      <div style={{ padding: "var(--vt-space-4)" }}>
        {tab === "leaderboard" && <LeaderboardTab />}
        {tab === "velocity" && <VelocityTab />}
        {tab === "streak" && <StreakTab />}
      </div>
    </div>
  );
}
