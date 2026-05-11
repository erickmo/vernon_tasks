import { Risk, RiskSeverity } from "../api/leader";

const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  low: "var(--vt-text-muted)",
  medium: "var(--vt-warn)",
  high: "var(--vt-danger)",
};

const TYPE_LABEL: Record<Risk["type"], string> = {
  blocked: "Tersumbat",
  slip: "Mundur",
  overcap: "Beban berlebih",
};

export function RiskList({ risks }: { risks: Risk[] }) {
  if (risks.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "var(--vt-text-muted)", padding: 16 }}>
        Tidak ada risiko terdeteksi
      </div>
    );
  }
  return (
    <div>
      {risks.map((r, idx) => (
        <div
          key={idx}
          style={{
            padding: "var(--vt-space-3)",
            background: "var(--vt-surface)",
            borderRadius: "var(--vt-radius)",
            borderLeft: `3px solid ${SEVERITY_COLOR[r.severity]}`,
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{TYPE_LABEL[r.type]}</span>
            <span style={{ color: SEVERITY_COLOR[r.severity], fontSize: 12, textTransform: "uppercase" }}>
              {r.severity}
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 13 }}>{r.detail}</div>
        </div>
      ))}
    </div>
  );
}
