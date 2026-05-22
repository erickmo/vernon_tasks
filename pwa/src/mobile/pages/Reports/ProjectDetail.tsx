import { useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchProjectVelocity,
  fetchProjectForecast,
  fetchProjectRisks,
  fetchProjectOkr,
  type Period,
  type ProjectVelocity,
  type RiskSeverity,
} from "../../../api/reports";
import { Skeleton } from "../../../components/Skeleton";
import { EmptyState } from "../../../components/EmptyState";
import { logEvent } from "../../../telemetry";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "Minggu" },
  { key: "month", label: "Bulan" },
  { key: "quarter", label: "Kuartal" },
];
const VALID_PERIODS: Period[] = ["week", "month", "quarter"];

export function ProjectDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const project = decodeURIComponent(id);
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const rawPeriod = params.get("period") as Period | null;
  const period: Period = rawPeriod && VALID_PERIODS.includes(rawPeriod) ? rawPeriod : "month";

  const velocityQ = useQuery({
    queryKey: ["reports", "project", project, "velocity", period],
    queryFn: () => fetchProjectVelocity(project, 6),
    staleTime: 60_000,
  });
  const forecastQ = useQuery({
    queryKey: ["reports", "project", project, "forecast"],
    queryFn: () => fetchProjectForecast(project),
    staleTime: 60_000,
  });
  const risksQ = useQuery({
    queryKey: ["reports", "project", project, "risks"],
    queryFn: () => fetchProjectRisks(project),
    staleTime: 60_000,
  });
  const okrQ = useQuery({
    queryKey: ["reports", "project", project, "okr", period],
    queryFn: () => fetchProjectOkr(project, period),
    staleTime: 60_000,
  });

  useEffect(() => {
    logEvent("reports_project_view", { project });
  }, [project]);

  function setPeriod(p: Period) {
    setParams({ period: p }, { replace: true });
    logEvent("reports_period_change", { scope: "project", period: p });
  }

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
        <button
          onClick={() => nav("/m/reports/projects")}
          aria-label="Back"
          style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "var(--vt-primary-dark)" }}
        >
          ‹
        </button>
        <h1 style={{ margin: 0, color: "var(--vt-primary-dark)", fontSize: 15, fontWeight: 600 }}>{project}</h1>
      </header>
      <div style={{ padding: "var(--vt-space-4)" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: "var(--vt-space-3)" }}>
          {PERIODS.map((p) => {
            const active = p.key === period;
            return (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                data-active={active ? "true" : "false"}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--vt-border)",
                  background: active ? "var(--vt-primary)" : "transparent",
                  color: active ? "var(--vt-primary-contrast)" : "var(--vt-text)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <Section title="Velocity">
          {velocityQ.isLoading && <Skeleton height={140} />}
          {velocityQ.isError && (
            <EmptyState title="Gagal memuat velocity" cta={{ label: "Coba lagi", onClick: () => velocityQ.refetch() }} />
          )}
          {velocityQ.data && <VelocitySummary data={velocityQ.data} />}
        </Section>

        <Section title="Forecast">
          {forecastQ.isLoading && <Skeleton height={80} />}
          {forecastQ.data && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              <Stat label="Target" value={forecastQ.data.target ?? "—"} />
              <Stat label="Projected" value={forecastQ.data.projected ?? "—"} />
              <Stat label="Gap" value={forecastQ.data.gap ?? "—"} />
            </div>
          )}
        </Section>

        <Section title="Risks">
          {risksQ.isLoading && <Skeleton height={80} />}
          {risksQ.data && risksQ.data.risks.length === 0 && <EmptyState title="Tidak ada risiko." />}
          {risksQ.data &&
            risksQ.data.risks.map((r, i) => (
              <div
                key={i}
                style={{
                  padding: 12,
                  marginBottom: 8,
                  background: "white",
                  borderRadius: 8,
                  borderLeft: `4px solid ${riskColor(r.severity)}`,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.flag}</div>
                <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>{r.message}</div>
              </div>
            ))}
        </Section>

        <Section title="OKR">
          {okrQ.isLoading && <Skeleton height={80} />}
          {okrQ.data &&
            (okrQ.data.objectives ?? []).map((o) => (
              <div key={o.name} style={{ padding: 12, marginBottom: 8, background: "white", borderRadius: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{o.name}</div>
                <div style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>
                  {o.progress}% — {o.status}
                </div>
              </div>
            ))}
          {okrQ.data && (okrQ.data.objectives ?? []).length === 0 && <EmptyState title="Tidak ada objective." />}
        </Section>
      </div>
    </div>
  );
}

function VelocitySummary({ data }: { data: ProjectVelocity }) {
  const trendArrow = data.trend === "up" ? "↑" : data.trend === "down" ? "↓" : "→";
  const trendColor = data.trend === "up" ? "#27ae60" : data.trend === "down" ? "#c0392b" : "#7f8c8d";
  return (
    <div style={{ background: "white", borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--vt-text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Avg velocity</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{data.avg_velocity.toFixed(1)}</div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: trendColor }}>{trendArrow}</div>
      </div>
      {data.sprints.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--vt-text-muted)", padding: 12, fontSize: 12 }}>
          Belum ada data sprint
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.sprints.map((s) => (
            <div key={s.sprint} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "var(--vt-text-muted)" }}>{s.sprint}</span>
              <span style={{ fontWeight: 600 }}>{s.velocity.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "var(--vt-space-4)" }}>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--vt-text-muted)",
          margin: "0 0 8px 0",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: 12, background: "white", borderRadius: 8, textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--vt-text-muted)" }}>{label}</div>
    </div>
  );
}

function riskColor(sev: RiskSeverity): string {
  if (sev === "high") return "#c0392b";
  if (sev === "med") return "#e67e22";
  return "#7f8c8d";
}
