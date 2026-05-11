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
