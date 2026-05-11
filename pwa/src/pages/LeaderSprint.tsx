import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchLatestSprint,
  fetchBurndown,
  fetchTeamVelocity,
  fetchForecast,
  fetchRisks,
} from "../api/leader";
import { useLedProjects } from "../hooks/useLedProjects";
import { ProjectPicker } from "../components/ProjectPicker";
import { BurndownChart } from "../components/BurndownChart";
import { ForecastChart } from "../components/ForecastChart";
import { RiskList } from "../components/RiskList";
import { VelocityChart } from "../components/VelocityChart";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { fmtDate } from "../i18n";
import { logEvent } from "../telemetry";

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 style={{ fontSize: 14, color: "var(--vt-text-muted)", textTransform: "uppercase", margin: "var(--vt-space-4) 0 var(--vt-space-2)" }}>
      {title}
    </h3>
  );
}

export default function LeaderSprint() {
  const projectsQ = useLedProjects();
  const [project, setProject] = useState("");
  const effective = project || projectsQ.data?.[0] || "";

  useEffect(() => {
    logEvent("leader_sprint_view", {});
  }, []);

  const sprintQ = useQuery({
    queryKey: ["latest-sprint", effective],
    queryFn: () => fetchLatestSprint(effective),
    enabled: Boolean(effective),
    staleTime: 60_000,
  });

  const sprintName = sprintQ.data?.name;

  const burndownQ = useQuery({
    queryKey: ["burndown", sprintName],
    queryFn: () => fetchBurndown(sprintName!),
    enabled: Boolean(sprintName),
    staleTime: 60_000,
  });
  const velocityQ = useQuery({
    queryKey: ["team-velocity", effective],
    queryFn: () => fetchTeamVelocity(effective, 6),
    enabled: Boolean(effective),
    staleTime: 60_000,
  });
  const forecastQ = useQuery({
    queryKey: ["forecast", effective],
    queryFn: () => fetchForecast(effective),
    enabled: Boolean(effective),
    staleTime: 60_000,
  });
  const risksQ = useQuery({
    queryKey: ["risks", effective],
    queryFn: () => fetchRisks(effective),
    enabled: Boolean(effective),
    staleTime: 60_000,
  });

  if (projectsQ.isLoading) return <Skeleton height={40} />;
  if (!projectsQ.data || projectsQ.data.length === 0) {
    return <EmptyState title="Belum ada proyek yang dipimpin" />;
  }

  return (
    <div>
      <ProjectPicker
        projects={projectsQ.data}
        value={effective}
        onChange={(p) => {
          setProject(p);
          logEvent("leader_project_change", { project: p });
        }}
      />

      {sprintQ.data && (
        <div style={{ background: "var(--vt-surface)", padding: 12, borderRadius: "var(--vt-radius)", fontSize: 13 }}>
          <strong>{sprintQ.data.title}</strong> ({sprintQ.data.status})
          <div style={{ color: "var(--vt-text-muted)", marginTop: 2 }}>
            {fmtDate(sprintQ.data.start_date)} — {fmtDate(sprintQ.data.end_date)}
          </div>
        </div>
      )}

      <SectionHeader title="Burndown" />
      {burndownQ.isLoading && <Skeleton height={220} />}
      {burndownQ.data && <BurndownChart data={burndownQ.data} />}
      {!sprintName && !sprintQ.isLoading && (
        <div style={{ color: "var(--vt-text-muted)", fontSize: 13 }}>Belum ada sprint untuk proyek ini.</div>
      )}

      <SectionHeader title="Velocity Tim" />
      {velocityQ.isLoading && <Skeleton height={220} />}
      {velocityQ.data && (
        <VelocityChart
          data={{
            sprints: velocityQ.data.sprints,
            personal: velocityQ.data.velocity,
            team_avg: [],
            avg: velocityQ.data.avg,
            team_avg_total: 0,
          }}
        />
      )}

      <SectionHeader title="Forecast" />
      {forecastQ.isLoading && <Skeleton height={120} />}
      {forecastQ.data && <ForecastChart data={forecastQ.data} />}

      <SectionHeader title="Risiko" />
      {risksQ.isLoading && <Skeleton height={80} />}
      {risksQ.data && <RiskList risks={risksQ.data} />}
    </div>
  );
}
