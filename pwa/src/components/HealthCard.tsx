import { HealthScore } from "../api/leaderExec";
import { ProgressBar } from "./ProgressBar";

function scoreColor(score: number): string {
  if (score >= 75) return "var(--vt-success)";
  if (score >= 50) return "var(--vt-warn)";
  return "var(--vt-danger)";
}

export function HealthCard({ data }: { data: HealthScore }) {
  const color = scoreColor(data.score);
  return (
    <div
      style={{
        background: "var(--vt-surface)",
        borderRadius: "var(--vt-radius)",
        padding: 16,
        marginBottom: "var(--vt-space-4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            border: `6px solid ${color}`,
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 28,
            color,
          }}
        >
          {Math.round(data.score)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: "var(--vt-text-muted)" }}>Skor Kesehatan</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            {data.score >= 75 ? "Sehat" : data.score >= 50 ? "Perhatian" : "Kritis"}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        <ProgressBar pct={data.okr_pct} label="OKR" />
        <ProgressBar pct={data.ontime_pct} label="Tepat waktu" />
        <ProgressBar pct={data.velocity_health} label="Velocity" />
      </div>
    </div>
  );
}
