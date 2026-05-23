export type Role = 'ic' | 'leader' | 'pm' | 'exec';
export type HealthBucket = 'red' | 'amber' | 'green' | 'grey';

export type RiskItem = {
  project_id: string;
  project_name: string;
  reason: string;
  severity: 'high' | 'med';
};

export type TodayCardData = {
  ontime_rate_7d: number;
  blocked_count: number;
  okr_confidence_delta_wow: number;
  next_deadline: { id: string; title: string; due_date: string } | null;
  pdca_queue: Record<string, number>;
  org_health_score?: number;
};

export type MeCardData = {
  points_week: number;
  streak_days: number;
  capacity_used_pct: number;
  ontime_rate_7d: number;
};

export type SprintCardData = {
  id: string;
  name: string;
  days_left: number;
  percent_done: number;
  burndown_spark: number[];
};

export type ProjectCardData = {
  id: string;
  name: string;
  health: HealthBucket;
  okr_progress: number;
  my_role: string;
  blocked_count: number;
  days_left: number | null;
};

export type DashboardPayload = {
  role: Role;
  at_risk: RiskItem[];
  today: TodayCardData;
  me: MeCardData;
  sprints: SprintCardData[];
  projects: ProjectCardData[];
};
