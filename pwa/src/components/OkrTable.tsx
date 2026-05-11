import { OkrRow } from "../api/leaderExec";
import { ProgressBar } from "./ProgressBar";

export function OkrTable({ rows }: { rows: OkrRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "var(--vt-text-muted)", padding: 24 }}>
        Belum ada OKR
      </div>
    );
  }
  return (
    <div>
      {rows.map((r) => (
        <div
          key={r.objective}
          style={{
            padding: "var(--vt-space-3)",
            borderBottom: "1px solid var(--vt-border)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{r.title}</div>
              <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>
                {r.owner} · {r.kr_count} KR · {r.status}
              </div>
            </div>
            <div style={{ marginLeft: 12, minWidth: 60, textAlign: "right", fontWeight: 600 }}>
              {Math.round(r.progress)}%
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <ProgressBar pct={r.progress} />
          </div>
        </div>
      ))}
    </div>
  );
}
