import { api } from "./client";

const PAGE = "vernon_tasks.task.page.leader_review.leader_review";

export interface ReviewItem {
  name: string;
  title: string;
  project: string;
  priority?: string;
  deadline?: string;
  assigned_to: string;
  pdca_phase: string;
  kanban_status: string;
  estimated_hours?: number;
  review_scheduled_date?: string;
}

export const fetchReviewQueue = () =>
  api.get<ReviewItem[]>(`/api/method/${PAGE}.get_review_queue`);

export const approveTask = (task_name: string) =>
  api.post<{ status: string }>(`/api/method/${PAGE}.approve_task`, { task_name });

export const rejectTask = (task_name: string, reason: string) =>
  api.post<{ status: string }>(`/api/method/${PAGE}.reject_task`, {
    task_name,
    reason,
  });

export const fetchMyLedProjects = () =>
  api.get<string[]>(`/api/method/${PAGE}.get_my_led_projects`);

export interface Sprint {
  name: string;
  title: string;
  start_date: string;
  end_date: string;
  status: string;
}

export const fetchLatestSprint = (project: string) =>
  api.get<Sprint | null>(
    `/api/method/${PAGE}.get_latest_sprint?project=${encodeURIComponent(project)}`,
  );

const ANALYTICS = "vernon_tasks.task.api.analytics";

export interface Burndown {
  labels: string[];
  ideal: number[];
  remaining: number[];
  unestimated_count: number;
}

export const fetchBurndown = (sprint: string) =>
  api.get<Burndown>(
    `/api/method/${ANALYTICS}.get_burndown?sprint=${encodeURIComponent(sprint)}`,
  );

export interface TeamVelocity {
  sprints: string[];
  velocity: number[];
  avg: number;
  trend_pct: number;
}

export const fetchTeamVelocity = (project: string, n = 6) =>
  api.get<TeamVelocity>(
    `/api/method/${ANALYTICS}.get_velocity_trend?project=${encodeURIComponent(project)}&n=${n}`,
  );

export interface Forecast {
  insufficient_data: boolean;
  sprints_needed?: number;
  predicted_end?: string;
  p_min?: string;
  p_max?: string;
  confidence?: number;
  remaining_hours?: number;
  avg_velocity?: number;
  sprints_used?: number;
  reason?: string;
}

export const fetchForecast = (project: string) =>
  api.get<Forecast>(
    `/api/method/${ANALYTICS}.get_forecast?project=${encodeURIComponent(project)}`,
  );

export type RiskSeverity = "low" | "medium" | "high";

export interface Risk {
  type: "blocked" | "slip" | "overcap";
  severity: RiskSeverity;
  target: string;
  detail: string;
  days: number;
}

export const fetchRisks = (project: string) =>
  api.get<Risk[]>(
    `/api/method/${ANALYTICS}.get_risks?project=${encodeURIComponent(project)}`,
  );
