import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMyProjects, type ProjectsFilter } from "../../../api/dashboard";
import { Skeleton } from "../../../components/Skeleton";
import { EmptyState } from "../../../components/EmptyState";
import { logEvent } from "../../../telemetry";
import { ProjectCard } from "./components/ProjectCard";
import { ProjectRow } from "./components/ProjectRow";
import { TOKENS } from "./components/shared";

const FILTERS: { key: ProjectsFilter; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "led", label: "Saya pimpin" },
  { key: "member", label: "Anggota" },
  { key: "at_risk", label: "Berisiko" },
];

function FilterStrip({
  value,
  onChange,
}: {
  value: ProjectsFilter;
  onChange: (v: ProjectsFilter) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        overflowX: "auto",
        padding: "4px 0 8px",
        scrollbarWidth: "none",
      }}
    >
      {FILTERS.map((f) => {
        const active = f.key === value;
        return (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            style={{
              flex: "0 0 auto",
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 99,
              border: `1px solid ${active ? TOKENS.PURPLE : TOKENS.BD}`,
              background: active ? TOKENS.PURPLE : TOKENS.CARD,
              color: active ? "#fff" : TOKENS.TEXT2,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: TOKENS.TEXT3,
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        margin: "12px 0 8px",
      }}
    >
      {children}
    </p>
  );
}

export function ProjectsTab() {
  const [filter, setFilter] = useState<ProjectsFilter>("all");

  useEffect(() => {
    logEvent("dashboard_tab_view", { tab: "projects" });
  }, []);

  useEffect(() => {
    logEvent("dashboard_project_filter", { filter });
  }, [filter]);

  const q = useQuery({
    queryKey: ["dashboard-my-projects", filter],
    queryFn: () => fetchMyProjects(filter),
    staleTime: 60_000,
  });

  return (
    <div>
      <div
        style={{
          position: "sticky",
          top: 0,
          background: TOKENS.BG,
          zIndex: 5,
        }}
      >
        <FilterStrip value={filter} onChange={setFilter} />
      </div>

      {q.isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton height={130} />
          <Skeleton height={130} />
        </div>
      )}

      {q.isError && (
        <EmptyState title="Gagal memuat proyek" cta={{ label: "Coba lagi", onClick: () => q.refetch() }} />
      )}

      {q.data && (
        <div
          aria-busy={q.isFetching && !q.isLoading ? true : undefined}
          style={{
            opacity: q.isFetching && !q.isLoading ? 0.55 : 1,
            transition: "opacity 120ms ease",
          }}
        >
          {q.data.led.length === 0 && q.data.member.length === 0 && (
            <EmptyState title="Belum ada proyek" body="Tidak ada proyek pada filter ini." />
          )}

          {q.data.led.length > 0 && (
            <>
              <SectionLabel>{q.data.is_admin ? "Semua Proyek" : "Saya Pimpin"}</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {q.data.led.map((p) => (
                  <ProjectCard key={p.id} data={p} />
                ))}
              </div>
            </>
          )}

          {q.data.member.length > 0 && (
            <>
              <SectionLabel>Anggota</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {q.data.member.map((p) => (
                  <ProjectRow key={p.id} data={p} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
