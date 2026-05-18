// ── OKR Tab ──────────────────────────────────────────────────────────────────
export interface HealthScoreResponse {
  score: number;
  okr_pct: number;
  ontime_pct: number;
  velocity_health: number;
  components: {
    okr_weight: number;
    ontime_weight: number;
    velocity_weight: number;
  };
  as_of: string;
}

export interface OkrRollupRow {
  project: string;
  project_title: string;
  objective_count: number;
  kr_count: number;
  avg_progress: number;
  on_track: number;
  at_risk: number;
  behind: number;
}

export interface OkrRollupTotals {
  objective_count: number;
  kr_count: number;
  avg_progress: number;
  on_track: number;
  at_risk: number;
  behind: number;
}

export interface OkrRollupResponse {
  period: string;
  rows: OkrRollupRow[];
  totals: OkrRollupTotals;
}

export interface KpiListItem {
  name: string;
  title: string;
  unit: string;
}

export interface KpiTrendPoint {
  label: string;
  value: number;
  target: number;
}

export interface KpiTrendResponse {
  kpi_definition: string;
  title: string;
  unit: string;
  periods: number;
  series: KpiTrendPoint[];
}

// ── Sprints Tab ───────────────────────────────────────────────────────────────
export interface VelocitySprintPoint {
  sprint_label: string;
  velocity: number;
}

export interface VelocityProject {
  project: string;
  project_title: string;
  sprints: VelocitySprintPoint[];
  avg_velocity: number;
  trend: "up" | "down" | "flat";
}

export interface VelocityComparisonResponse {
  n: number;
  projects: VelocityProject[];
}

export type ForecastStatus = "on_track" | "at_risk" | "delayed";

export interface ForecastItem {
  project: string;
  project_title: string;
  completion_estimate: string;
  confidence: number;
  remaining_points: number;
  avg_velocity: number;
  status: ForecastStatus;
}

export interface ForecastsResponse {
  forecasts: ForecastItem[];
}

export type RiskLevel = "high" | "medium" | "low" | "none";

export interface RiskFlag {
  type: string;
  level: RiskLevel;
  count?: number;
  delta_pct?: number;
  days_since?: number;
}

export interface RiskProject {
  project: string;
  project_title: string;
  flags: RiskFlag[];
  max_level: RiskLevel;
}

export interface RisksResponse {
  risks: RiskProject[];
}

// ── Team Tab ──────────────────────────────────────────────────────────────────
export interface LeaderboardRow {
  rank: number;
  user: string;
  full_name: string;
  points: number;
  tasks_completed: number;
  streak_days: number;
  avg_quality: number;
}

export interface LeaderboardResponse {
  period: string;
  rows: LeaderboardRow[];
}

export interface WorkloadMember {
  user: string;
  full_name: string;
  open_tasks: number;
  open_hours: number;
  overdue_tasks: number;
  overdue_hours: number;
  projects: string[];
}

export interface WorkloadResponse {
  as_of: string;
  members: WorkloadMember[];
}

export interface OverdueMemberRow {
  user: string;
  full_name: string;
  overdue_count: number;
  overdue_hours: number;
  oldest_overdue_days: number;
}

export interface OverdueProjectRow {
  project: string;
  project_title: string;
  overdue_count: number;
  overdue_hours: number;
}

export interface OverdueResponse {
  as_of: string;
  total_overdue: number;
  by_member: OverdueMemberRow[];
  by_project: OverdueProjectRow[];
}
