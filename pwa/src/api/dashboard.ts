import { api } from "./client";

const PAGE = "vernon_tasks.task.page.my_dashboard.my_dashboard";

export interface EmployeeStats {
  done_today: number;
  done_week: number;
  points_month: number;
  blocked: number;
}

export interface DailyCompletion {
  date: string;
  count: number;
}

export interface HoursSummary {
  actual_hours: number;
  estimated_hours: number;
}

export interface KanbanItem {
  id: string;
  title: string;
  points: number;
  priority?: string | null;
  deadline?: string | null;
}

export type KanbanColumns = Record<string, KanbanItem[]>;

export interface SprintKanban {
  sprint: {
    name: string;
    title: string;
    start_date: string;
    end_date: string;
    progress_pct: number;
  } | null;
  columns: KanbanColumns;
}

export const fetchEmployeeStats = () =>
  api.get<EmployeeStats>(`/api/method/${PAGE}.get_employee_stats`);

export const fetchDailyCompletions = () =>
  api.get<DailyCompletion[]>(`/api/method/${PAGE}.get_daily_completions`);

export const fetchHoursSummary = () =>
  api.get<HoursSummary>(`/api/method/${PAGE}.get_hours_summary`);

export const fetchSprintKanban = () =>
  api.get<SprintKanban>(`/api/method/${PAGE}.get_sprint_kanban`);

// ── Mix-view dashboard (2026-05-22 spec) ────────────────────────────────────
const MIX = "vernon_tasks.task.api.dashboard";

export type RiskLevel = "on_track" | "at_risk" | "behind";

export interface VelocityWeek {
  week: string;
  done: number;
}

export interface MeSprint {
  name: string;
  start_date: string;
  end_date: string;
  committed_points: number;
  done_points: number;
  progress_pct: number;
  risk: RiskLevel;
}

export interface MeWorkload {
  open: number;
  overdue: number;
  due_soon: number;
}

export interface NextAction {
  id: string;
  title: string | null;
  project: string | null;
  deadline: string | null;
  priority: string | null;
}

export interface MeProgress {
  velocity: VelocityWeek[];
  velocity_delta: number;
  sprint: MeSprint | null;
  workload: MeWorkload;
  next_actions: NextAction[];
}

export interface ProjectCardSprint {
  name: string;
  start: string;
  end: string;
  burndown_ideal: number[];
  burndown_actual: number[];
}

export interface ProjectCard {
  id: string;
  name: string;
  status: string | null;
  sprint: ProjectCardSprint | null;
  pct_done: number;
  open_tasks: number;
  blockers: number;
  risk: RiskLevel;
}

export interface ProjectRow {
  id: string;
  name: string;
  pct_done: number;
  next_milestone: string | null;
  my_open_tasks: number;
}

export interface MyProjects {
  is_admin: boolean;
  led: ProjectCard[];
  member: ProjectRow[];
}

export type ProjectsFilter = "all" | "led" | "member" | "at_risk";

export interface AgendaItem {
  type: "task" | "meeting" | "sprint_start" | "sprint_end";
  id: string;
  title: string | null;
  project: string | null;
  date: string;
  time: string | null;
  priority: string | null;
  route: string;
}

export interface AgendaDay {
  date: string;
  label: string;
  items: AgendaItem[];
}

export interface ScheduleAgenda {
  today_summary: { tasks: number; meetings: number; sprint_events: number };
  days: AgendaDay[];
}

export const fetchMeProgress = () =>
  api.get<MeProgress>(`/api/method/${MIX}.me_progress`);

export const fetchMyProjects = (filter: ProjectsFilter = "all") =>
  api.get<MyProjects>(`/api/method/${MIX}.my_projects?filter=${filter}`);

export const fetchScheduleAgenda = (include = "") =>
  api.get<ScheduleAgenda>(
    `/api/method/${MIX}.schedule_agenda${include ? `?include=${include}` : ""}`,
  );
