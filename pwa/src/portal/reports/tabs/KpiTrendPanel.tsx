import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPortalKpiList, getPortalKpiTrend } from "../api/portal_reports";
import { KpiTrendChart } from "../charts/KpiTrendChart";
import { trackReportsKpiSelect } from "../../../telemetry";

export function KpiTrendPanel() {
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);

  const kpiList = useQuery({
    queryKey: ["reports", "kpi_list"],
    queryFn: () => getPortalKpiList(),
    staleTime: 5 * 60 * 1000,
  });

  const firstKpi = kpiList.data?.[0]?.name ?? null;
  const activeKpi = selectedKpi ?? firstKpi;

  const trend = useQuery({
    queryKey: ["reports", "kpi_trend", activeKpi, 12],
    queryFn: () => getPortalKpiTrend(activeKpi!, 12),
    enabled: !!activeKpi,
    staleTime: 5 * 60 * 1000,
  });

  function handleKpiChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedKpi(e.target.value);
    trackReportsKpiSelect(e.target.value);
  }

  return (
    <div className="kpi-trend-panel">
      <div className="kpi-trend-panel__header">
        <label htmlFor="kpi-select">KPI</label>
        <select id="kpi-select" value={activeKpi ?? ""} onChange={handleKpiChange}>
          {(kpiList.data ?? []).map((k) => (
            <option key={k.name} value={k.name}>
              {k.title} ({k.unit})
            </option>
          ))}
        </select>
      </div>
      {trend.isLoading && <div className="chart-loading">Loading…</div>}
      {trend.data && (
        <KpiTrendChart series={trend.data.series} unit={trend.data.unit} />
      )}
    </div>
  );
}
