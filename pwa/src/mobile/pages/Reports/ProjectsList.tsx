import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useManagedProjects } from "./hooks/useManagedProjects";
import { Skeleton } from "../../../components/Skeleton";
import { EmptyState } from "../../../components/EmptyState";
import { logEvent } from "../../../telemetry";

export function ProjectsList() {
  const { projects, isLoading, isError, refetch } = useManagedProjects();
  const nav = useNavigate();

  useEffect(() => {
    logEvent("reports_projects_view", {});
  }, []);

  return (
    <div style={{ background: "var(--vt-primary-light)", flex: 1, display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "var(--vt-primary-light)",
          padding: "var(--vt-space-4)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button onClick={() => nav("/m/reports")} aria-label="Back" style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "var(--vt-primary-dark)" }}>‹</button>
        <h1 style={{ margin: 0, color: "var(--vt-primary-dark)", fontSize: 15, fontWeight: 600 }}>Projects I Manage</h1>
      </header>
      <div style={{ padding: "var(--vt-space-4)" }}>
        {isLoading && <Skeleton height={64} />}
        {isError && <EmptyState title="Gagal memuat" cta={{ label: "Coba lagi", onClick: () => refetch() }} />}
        {!isLoading && projects.length === 0 && <EmptyState title="No projects to report on." />}
        {projects.map((p) => (
          <Link
            key={p.name}
            to={`/m/reports/projects/${encodeURIComponent(p.name)}`}
            style={{
              display: "block",
              padding: 16,
              marginBottom: 10,
              background: "white",
              borderRadius: 12,
              boxShadow: "0 1px 6px rgba(149,97,171,0.12)",
              textDecoration: "none",
              color: "var(--vt-text)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.project_title}</div>
              <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: "var(--vt-primary-light)", color: "var(--vt-primary-dark)" }}>{p.status}</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <Chip>{p.avg_velocity.toFixed(1)} vel</Chip>
              <Chip>{p.risk_count} risk{p.risk_count === 1 ? "" : "s"}</Chip>
              <Chip>{p.member_count} member{p.member_count === 1 ? "" : "s"}</Chip>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: "#f5f0fa", color: "var(--vt-primary-dark)", fontWeight: 600 }}>
      {children}
    </span>
  );
}
