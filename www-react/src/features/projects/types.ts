import type { HealthBucket } from '@/features/dashboard/types';

export type ProjectListRow = {
  id: string;
  name: string;
  health: HealthBucket;
  percent_done: number;
  days_left: number | null;
  blocked_count: number;
  owner: { id: string; name: string; avatar: string | null };
  current_sprint: { id: string; name: string; days_left: number } | null;
};

export type ProjectListFilters = {
  search?: string;
  mine?: boolean;
  active?: boolean;
  has_blockers?: boolean;
  sprint_active?: boolean;
  risk_high?: boolean;
  sort?: 'health_asc' | 'days_left_asc' | 'blocked_desc';
};

export type GroupBy = 'kr' | 'pdca' | 'sprint' | 'assignee' | 'due';

export type TaskRow = {
  id: string;
  title: string;
  pdca: string;
  assignee: string | null;
  due_date: string | null;
  points: number;
  status: string;
  linked_kr: string | null;
  sprint: string | null;
  risk_flag: string | null;
};

export type TaskBucket = {
  key: string;
  label: string;
  meta: { target?: number; current?: number; progress?: number };
  tasks: TaskRow[];
};

export type ProjectDetail = {
  id: string;
  title: string;
  project_lead: string | null;
  health_score: number;
  percent_done: number;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  active_sprint: { id?: string; name: string; days_left?: number; title?: string } | null;
  linked_objective: string | null;
  blocked_count: number;
};
