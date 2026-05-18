import type { PortfolioProject } from "../api/portalDashboard";

const RAG_COLOR = { green: "#16a34a", amber: "#f59e0b", red: "#dc2626" } as const;

interface Props { projects: PortfolioProject[] }

export function PortfolioList({ projects }: Props) {
  if (projects.length === 0) {
    return <div style={{ fontSize: 11, color: "#6b63a0" }}>Tidak ada project aktif</div>;
  }
  return (
    <div>
      {projects.map((p) => (
        <div key={p.project} className="db-port-row">
          <div className={`db-port-dot db-port-dot--${p.rag}`} />
          <span className="db-port-name">{p.title}</span>
          {p.sprint_title && (
            <span className="db-port-sprint">
              {p.sprint_days_remaining != null ? `${p.sprint_days_remaining}h` : ""}
            </span>
          )}
          <div style={{ width: 56 }}>
            <div className="db-bar">
              <div
                className="db-bar__fill"
                style={{ width: `${p.progress_pct}%`, background: RAG_COLOR[p.rag] }}
              />
            </div>
          </div>
          <span className="db-port-pct" style={{ color: RAG_COLOR[p.rag] }}>{p.progress_pct}%</span>
        </div>
      ))}
    </div>
  );
}
