import { api } from "../../../api/client";

const BASE = "/api/method/vernon_tasks.api.portal_dashboard";

export interface DashboardSummary {
  team_blocked: number;
  unassigned_tasks: number;
  okr_progress: number;
  my_overdue: number;
  sprint_days_remaining: number;
}

export interface TeamMember {
  user: string;
  task_id: string;
  task_title: string;
  pdca_phase: string;
  kanban_status: string;
  status: "on_track" | "blocked" | "overdue";
}

export interface UnassignedTask {
  name: string;
  title: string;
  pdca_phase: string;
  sprint: string | null;
  project: string;
}

export interface TimelineTask {
  id: string;
  title: string;
  pdca_phase: string;
  done: boolean;
}

export interface OwnerOkr {
  name: string;
  title: string;
  progress_pct: number;
  trend_delta?: number;
}

export interface PortfolioProject {
  project: string;
  title: string;
  progress_pct: number;
  rag: "green" | "amber" | "red";
  sprint_title: string | null;
  sprint_days_remaining: number | null;
}

export const portalDashboardApi = {
  getSummary: () =>
    api.get<DashboardSummary>(`${BASE}.get_summary`),

  getTeamPulse: (project?: string) =>
    api.get<TeamMember[]>(`${BASE}.get_team_pulse`, project ? { project } : undefined),

  getUnassignedTasks: (project?: string) =>
    api.get<UnassignedTask[]>(`${BASE}.get_unassigned_tasks`, project ? { project } : undefined),

  getMyTasksTimeline: (daysBack = 3, daysForward = 3) =>
    api.get<Record<string, TimelineTask[]>>(`${BASE}.get_my_tasks_timeline`, {
      days_back: String(daysBack),
      days_forward: String(daysForward),
    }),

  getPortfolioSummary: () =>
    api.get<PortfolioProject[]>(`${BASE}.get_portfolio_summary`),

  getOwnerOkrs: () =>
    api.get<OwnerOkr[]>(`${BASE}.get_owner_okrs`),
};
