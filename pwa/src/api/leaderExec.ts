import { api } from "./client";

const EXEC = "vernon_tasks.task.api.exec_analytics";

export interface HealthScore {
  score: number;
  okr_pct: number;
  ontime_pct: number;
  velocity_health: number;
}

export const fetchHealthScore = () =>
  api.get<HealthScore>(`/api/method/${EXEC}.get_health_score`);

export interface OkrRow {
  objective: string;
  title: string;
  owner: string;
  status: string;
  progress: number;
  kr_count: number;
}

export const fetchOkrRollup = (period?: string) =>
  api.get<OkrRow[]>(
    `/api/method/${EXEC}.get_okr_rollup${period ? `?period=${encodeURIComponent(period)}` : ""}`,
  );

export interface KpiMeta {
  name: string;
  kpi_name: string;
  unit: string;
  frequency: string;
}

export const fetchKpiList = () => api.get<KpiMeta[]>(`/api/method/${EXEC}.list_kpis`);

export interface KpiTrend {
  labels: string[];
  values: number[];
  unit: string;
  kpi_name: string;
}

export const fetchKpiTrend = (kpi: string, periods = 12) =>
  api.get<KpiTrend>(
    `/api/method/${EXEC}.get_kpi_trend?kpi_definition=${encodeURIComponent(kpi)}&periods=${periods}`,
  );
