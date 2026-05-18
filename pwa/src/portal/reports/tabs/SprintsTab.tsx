import { useState } from "react";
import { useSprintsReport } from "../hooks/useSprintsReport";
import { VelocityComparisonChart } from "../charts/VelocityComparisonChart";
import { ForecastGrid } from "./ForecastGrid";
import { RiskMatrix } from "./RiskMatrix";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { trackReportsVelocityNChange } from "../../../telemetry";

const N_OPTIONS = [3, 6, 12] as const;
type NOption = (typeof N_OPTIONS)[number];

export function SprintsTab() {
  const [n, setN] = useState<NOption>(6);
  const { velocity, forecasts, risks } = useSprintsReport(n);

  if (velocity.isLoading || forecasts.isLoading || risks.isLoading) {
    return <PageSkeleton />;
  }

  function handleNChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = Number(e.target.value) as NOption;
    setN(val);
    trackReportsVelocityNChange(val);
  }

  return (
    <div className="sprints-tab">
      <div className="sprints-tab__velocity-section">
        <div className="sprints-tab__velocity-header">
          <h3>Velocity Comparison</h3>
          <select value={n} onChange={handleNChange} aria-label="Number of sprints">
            {N_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>Last {opt} sprints</option>
            ))}
          </select>
        </div>
        <VelocityComparisonChart projects={velocity.data?.projects ?? []} />
      </div>
      <div className="sprints-tab__lower">
        <div className="sprints-tab__forecasts">
          <h3>Forecast</h3>
          <ForecastGrid forecasts={forecasts.data?.forecasts ?? []} />
        </div>
        <div className="sprints-tab__risks">
          <h3>Risk Matrix</h3>
          <RiskMatrix risks={risks.data?.risks ?? []} />
        </div>
      </div>
    </div>
  );
}
