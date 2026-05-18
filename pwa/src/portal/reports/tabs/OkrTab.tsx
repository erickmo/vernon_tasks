import { useState } from "react";
import { useOkrReport } from "../hooks/useOkrReport";
import { HealthScoreCard } from "./HealthScoreCard";
import { OkrRollupTable } from "./OkrRollupTable";
import { KpiTrendPanel } from "./KpiTrendPanel";
import { PageSkeleton } from "../../../components/PageSkeleton";

const EMPTY_TOTALS = {
  objective_count: 0, kr_count: 0, avg_progress: 0,
  on_track: 0, at_risk: 0, behind: 0,
};

export function OkrTab() {
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const { health, rollup } = useOkrReport(period);

  if (health.isLoading || rollup.isLoading) return <PageSkeleton />;

  return (
    <div className="okr-tab">
      <div className="okr-tab__top-row">
        {health.data && <HealthScoreCard {...health.data} />}
        <div className="okr-tab__period">
          <label htmlFor="okr-period">Period</label>
          <select
            id="okr-period"
            value={period ?? ""}
            onChange={(e) => setPeriod(e.target.value || undefined)}
          >
            <option value="">Current</option>
          </select>
        </div>
      </div>
      <div className="okr-tab__main">
        <div className="okr-tab__left">
          <OkrRollupTable
            rows={rollup.data?.rows ?? []}
            totals={rollup.data?.totals ?? EMPTY_TOTALS}
          />
        </div>
        <div className="okr-tab__right">
          <KpiTrendPanel />
        </div>
      </div>
    </div>
  );
}
