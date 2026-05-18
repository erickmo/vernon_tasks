import { api } from "../../../api/client";
import type {
  HealthScoreResponse,
  OkrRollupResponse,
  KpiListItem,
  KpiTrendResponse,
  VelocityComparisonResponse,
  ForecastsResponse,
  RisksResponse,
  LeaderboardResponse,
  WorkloadResponse,
  OverdueResponse,
} from "./types";

const BASE = "/api/method/vernon_tasks.api.portal_reports";

export function getPortalHealthScore(): Promise<HealthScoreResponse> {
  return api.get<HealthScoreResponse>(`${BASE}.get_portal_health_score`);
}

export function getPortalOkrRollup(period?: string): Promise<OkrRollupResponse> {
  return api.get<OkrRollupResponse>(`${BASE}.get_portal_okr_rollup`, period ? { period } : {});
}

export function getPortalKpiList(): Promise<KpiListItem[]> {
  return api.get<KpiListItem[]>(`${BASE}.get_portal_kpi_list`);
}

export function getPortalKpiTrend(
  kpi_definition: string,
  periods = 12,
): Promise<KpiTrendResponse> {
  return api.get<KpiTrendResponse>(`${BASE}.get_portal_kpi_trend`, {
    kpi_definition,
    periods: String(periods),
  });
}

export function getPortalVelocityComparison(n = 6): Promise<VelocityComparisonResponse> {
  return api.get<VelocityComparisonResponse>(`${BASE}.get_portal_velocity_comparison`, { n: String(n) });
}

export function getPortalForecasts(): Promise<ForecastsResponse> {
  return api.get<ForecastsResponse>(`${BASE}.get_portal_forecasts`);
}

export function getPortalRisks(): Promise<RisksResponse> {
  return api.get<RisksResponse>(`${BASE}.get_portal_risks`);
}

export function getPortalLeaderboard(
  period = "this_month",
  limit = 20,
): Promise<LeaderboardResponse> {
  return api.get<LeaderboardResponse>(`${BASE}.get_portal_leaderboard`, { period, limit: String(limit) });
}

export function getPortalWorkload(): Promise<WorkloadResponse> {
  return api.get<WorkloadResponse>(`${BASE}.get_portal_workload`);
}

export function getPortalOverdue(): Promise<OverdueResponse> {
  return api.get<OverdueResponse>(`${BASE}.get_portal_overdue`);
}
