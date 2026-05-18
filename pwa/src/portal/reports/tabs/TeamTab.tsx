import { useState } from "react";
import { useTeamReport } from "../hooks/useTeamReport";
import { LeaderboardTable } from "./LeaderboardTable";
import { OverdueTable } from "./OverdueTable";
import { CompletionRingChart } from "../charts/CompletionRingChart";
import { WorkloadChart } from "../charts/WorkloadChart";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { trackReportsLeaderboardPeriodChange } from "../../../telemetry";

const PERIODS = ["this_week", "this_month", "all_time"] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABEL: Record<Period, string> = {
  this_week:  "This Week",
  this_month: "This Month",
  all_time:   "All Time",
};

export function TeamTab() {
  const [period, setPeriod] = useState<Period>("this_month");
  const { leaderboard, workload, overdue } = useTeamReport(period);

  if (leaderboard.isLoading || workload.isLoading || overdue.isLoading) {
    return <PageSkeleton />;
  }

  function handlePeriodChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value as Period;
    setPeriod(val);
    trackReportsLeaderboardPeriodChange(val);
  }

  return (
    <div className="team-tab">
      <div className="team-tab__top-row">
        <div className="team-tab__leaderboard-section">
          <div className="team-tab__leaderboard-header">
            <h3>Leaderboard</h3>
            <select value={period} onChange={handlePeriodChange}>
              {PERIODS.map((p) => (
                <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
              ))}
            </select>
          </div>
          <LeaderboardTable rows={leaderboard.data?.rows ?? []} />
        </div>
        <div className="team-tab__charts-section">
          <CompletionRingChart rows={leaderboard.data?.rows ?? []} />
          <WorkloadChart members={workload.data?.members ?? []} />
        </div>
      </div>
      <div className="team-tab__overdue-section">
        <h3>Overdue Analysis</h3>
        {overdue.data && <OverdueTable data={overdue.data} />}
      </div>
    </div>
  );
}
