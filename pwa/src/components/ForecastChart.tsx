import { Forecast } from "../api/leader";
import { fmtDate } from "../i18n";

export function ForecastChart({ data }: { data: Forecast }) {
  if (data.insufficient_data) {
    return (
      <div style={{ padding: 16, color: "var(--vt-text-muted)", textAlign: "center" }}>
        {data.reason
          ? "Forecast tidak tersedia"
          : `Data sprint kurang (butuh ${data.sprints_needed} sprint lagi)`}
      </div>
    );
  }
  const conf = Math.round((data.confidence ?? 0) * 100);
  return (
    <div style={{ background: "var(--vt-surface)", borderRadius: "var(--vt-radius)", padding: 16 }}>
      <div style={{ fontSize: 13, color: "var(--vt-text-muted)" }}>Perkiraan selesai</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
        {data.predicted_end ? fmtDate(data.predicted_end) : "—"}
      </div>
      <div style={{ fontSize: 12, color: "var(--vt-text-muted)", marginTop: 4 }}>
        Rentang: {data.p_min ? fmtDate(data.p_min) : "—"} — {data.p_max ? fmtDate(data.p_max) : "—"}
      </div>
      <div style={{ marginTop: 12, fontSize: 13 }}>
        Keyakinan: <strong>{conf}%</strong>
        {" · "}
        Sisa: <strong>{data.remaining_hours ?? 0}h</strong>
        {" · "}
        Avg velocity: <strong>{data.avg_velocity ?? 0}</strong>
      </div>
    </div>
  );
}
