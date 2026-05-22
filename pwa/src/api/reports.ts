import { api } from "./client";

const BASE = "/api/method/vernon_tasks.api.portal_reports";

export type Period = "week" | "month" | "quarter";
export type RiskSeverity = "low" | "med" | "high";
export type VelocityTrendDirection = "up" | "down" | "flat";

// ── Types ──
export interface ManagedProject {
  name: string;
  project_title: string;
  status: string;
  avg_velocity: number;
  risk_count: number;
  member_count: number;
}

export interface SprintVelocity {
  sprint: string;
  velocity: number;
}

export interface ProjectVelocity {
  project: string;
  sprints: SprintVelocity[];
  avg_velocity: number;
  trend: VelocityTrendDirection;
}

export interface ProjectForecast {
  project?: string;
  target?: number;
  projected?: number;
  gap?: number;
}

export interface ProjectRisk {
  flag: string;
  message: string;
  severity: RiskSeverity;
}

export interface ProjectRisks {
  risks: ProjectRisk[];
}

export interface ProjectObjective {
  name: string;
  progress: number;
  status: string;
}

export interface ProjectOkr {
  objectives?: ProjectObjective[];
}

export interface TeamLeaderboardRow {
  user: string;
  points: number;
  task_count: number;
}

export interface TeamLeaderboard {
  rows: TeamLeaderboardRow[];
  period: Period;
}

export interface OverdueTask {
  name: string;
  subject: string;
  assignee: string;
  due_date: string;
  project: string;
}

export interface TeamOverdue {
  total: number;
  items: OverdueTask[];
}

export interface WorkloadMember {
  user: string;
  open_tasks: number;
}

export interface TeamWorkload {
  members: WorkloadMember[];
}

export interface TeamCompletion {
  completion_pct: number;
  done: number;
  total: number;
}

// ── Endpoints ──
export const listManagedProjects = () =>
  api.get<{ projects: ManagedProject[] }>(`${BASE}.list_managed_projects`);

export const fetchProjectVelocity = (project: string, n = 6) =>
  api.get<ProjectVelocity>(
    `${BASE}.get_mobile_project_velocity?project=${encodeURIComponent(project)}&n=${n}`,
  );

export const fetchProjectForecast = (project: string) =>
  api.get<ProjectForecast>(
    `${BASE}.get_mobile_project_forecast?project=${encodeURIComponent(project)}`,
  );

export const fetchProjectRisks = (project: string) =>
  api.get<ProjectRisks>(
    `${BASE}.get_mobile_project_risks?project=${encodeURIComponent(project)}`,
  );

export const fetchProjectOkr = (project: string, period?: Period) => {
  const url = period
    ? `${BASE}.get_mobile_project_okr?project=${encodeURIComponent(project)}&period=${period}`
    : `${BASE}.get_mobile_project_okr?project=${encodeURIComponent(project)}`;
  return api.get<ProjectOkr>(url);
};

export const fetchTeamLeaderboard = (period: Period = "month", limit = 10) =>
  api.get<TeamLeaderboard>(
    `${BASE}.get_mobile_team_leaderboard?period=${period}&limit=${limit}`,
  );

export const fetchTeamOverdue = () =>
  api.get<TeamOverdue>(`${BASE}.get_mobile_team_overdue`);

export const fetchTeamWorkload = () =>
  api.get<TeamWorkload>(`${BASE}.get_mobile_team_workload`);

export const fetchTeamCompletion = (period: Period = "month") =>
  api.get<TeamCompletion>(`${BASE}.get_mobile_team_completion?period=${period}`);
