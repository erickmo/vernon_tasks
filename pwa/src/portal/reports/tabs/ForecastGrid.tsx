import type { ForecastItem, ForecastStatus } from "../api/types";

const STATUS_CLASS: Record<ForecastStatus, string> = {
  on_track: "forecast-card--on-track",
  at_risk:  "forecast-card--at-risk",
  delayed:  "forecast-card--delayed",
};

const STATUS_LABEL: Record<ForecastStatus, string> = {
  on_track: "On Track",
  at_risk:  "At Risk",
  delayed:  "Delayed",
};

interface Props {
  forecasts: ForecastItem[];
}

export function ForecastGrid({ forecasts }: Props) {
  if (forecasts.length === 0) {
    return <div className="empty-state">No forecast data available.</div>;
  }
  return (
    <div className="forecast-grid">
      {forecasts.map((fc) => (
        <div key={fc.project} className={`forecast-card ${STATUS_CLASS[fc.status]}`}>
          <div className="forecast-card__title">{fc.project_title}</div>
          <div className="forecast-card__estimate">{fc.completion_estimate}</div>
          <div className="forecast-card__badge">{STATUS_LABEL[fc.status]}</div>
          <div className="forecast-card__confidence">
            {Math.round(fc.confidence * 100)}% confidence
          </div>
          <div className="forecast-card__remaining">
            {fc.remaining_points} pts remaining · avg {fc.avg_velocity} pts/sprint
          </div>
        </div>
      ))}
    </div>
  );
}
