import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchHealthScore,
  fetchOkrRollup,
  fetchKpiList,
  fetchKpiTrend,
} from "../api/leaderExec";
import { HealthCard } from "../components/HealthCard";
import { OkrTable } from "../components/OkrTable";
import { KpiPicker } from "../components/KpiPicker";
import { KpiTrendChart } from "../components/KpiTrendChart";
import { Skeleton } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { logEvent } from "../telemetry";

function SectionHeader({ title }: { title: string }) {
  return (
    <h3
      style={{
        fontSize: 14,
        color: "var(--vt-text-muted)",
        textTransform: "uppercase",
        margin: "var(--vt-space-4) 0 var(--vt-space-2)",
      }}
    >
      {title}
    </h3>
  );
}

export default function LeaderExec() {
  useEffect(() => {
    logEvent("leader_exec_view", {});
  }, []);

  const healthQ = useQuery({
    queryKey: ["health-score"],
    queryFn: fetchHealthScore,
    staleTime: 60_000,
  });
  const okrQ = useQuery({
    queryKey: ["okr-rollup"],
    queryFn: () => fetchOkrRollup(),
    staleTime: 60_000,
  });
  const kpisQ = useQuery({
    queryKey: ["kpi-list"],
    queryFn: fetchKpiList,
    staleTime: 5 * 60_000,
  });
  const [kpi, setKpi] = useState("");
  const effectiveKpi = kpi || kpisQ.data?.[0]?.name || "";
  const kpiTrendQ = useQuery({
    queryKey: ["kpi-trend", effectiveKpi],
    queryFn: () => fetchKpiTrend(effectiveKpi, 12),
    enabled: Boolean(effectiveKpi),
    staleTime: 60_000,
  });

  if (healthQ.isError && (healthQ.error as { status?: number }).status === 403) {
    return <EmptyState title="Akses manajer diperlukan" />;
  }

  return (
    <div>
      <SectionHeader title="Kesehatan Organisasi" />
      {healthQ.isLoading && <Skeleton height={140} />}
      {healthQ.data && <HealthCard data={healthQ.data} />}

      <SectionHeader title="OKR Rollup" />
      {okrQ.isLoading && <Skeleton height={120} />}
      {okrQ.data && <OkrTable rows={okrQ.data} />}

      <SectionHeader title="KPI Trend" />
      <KpiPicker
        kpis={kpisQ.data ?? []}
        value={effectiveKpi}
        onChange={setKpi}
        loading={kpisQ.isLoading}
      />
      {kpiTrendQ.isLoading && <Skeleton height={220} />}
      {kpiTrendQ.data && <KpiTrendChart data={kpiTrendQ.data} />}
    </div>
  );
}
