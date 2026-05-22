import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Tabs } from "../../../components/Tabs";
import { LeaderboardTab, VelocityTab, StreakTab } from "../Analytics";
import { logEvent } from "../../../telemetry";

type TabKey = "leaderboard" | "velocity" | "streak";
const TABS = [
  { key: "leaderboard", label: "Leaderboard" },
  { key: "velocity", label: "Velocity" },
  { key: "streak", label: "Streak" },
];
const VALID_TABS: TabKey[] = ["leaderboard", "velocity", "streak"];

export function MyReports() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const rawTab = params.get("tab") as TabKey;
  const tab = VALID_TABS.includes(rawTab) ? rawTab : "leaderboard";

  useEffect(() => {
    logEvent("reports_my_view", { tab });
  }, [tab]);

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
        <h1 style={{ margin: 0, color: "var(--vt-primary-dark)", fontSize: 15, fontWeight: 600 }}>
          My Reports
        </h1>
      </header>
      <div
        style={{
          position: "sticky",
          top: 56,
          background: "white",
          zIndex: 9,
          borderBottom: "1px solid var(--vt-border)",
          padding: "0 var(--vt-space-4)",
        }}
      >
        <Tabs tabs={TABS} active={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} />
      </div>
      <div style={{ padding: "var(--vt-space-4)" }}>
        {tab === "leaderboard" && <LeaderboardTab />}
        {tab === "velocity" && <VelocityTab />}
        {tab === "streak" && <StreakTab />}
      </div>
    </div>
  );
}
