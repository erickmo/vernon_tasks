import type { HealthScoreResponse } from "../api/types";

type Props = HealthScoreResponse;

function scoreClass(score: number): string {
  if (score >= 80) return "health-score--green";
  if (score >= 60) return "health-score--amber";
  return "health-score--red";
}

export function HealthScoreCard(props: Props) {
  const cls = scoreClass(props.score);
  return (
    <div
      className={`health-score-card ${cls}`}
      aria-label={`Health Score: ${Math.round(props.score)}`}
    >
      <div className="health-score-card__score">{Math.round(props.score)}</div>
      <div className="health-score-card__components">
        <span>OKR {Math.round(props.components.okr_weight * 100)}%: {Math.round(props.okr_pct * 100)}%</span>
        <span>Ontime {Math.round(props.components.ontime_weight * 100)}%: {Math.round(props.ontime_pct * 100)}%</span>
        <span>Velocity {Math.round(props.components.velocity_weight * 100)}%: {Math.round(props.velocity_health * 100)}%</span>
      </div>
      <div className="health-score-card__as-of">As of {props.as_of}</div>
    </div>
  );
}
