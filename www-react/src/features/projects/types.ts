import type { HealthBucket } from '@/features/dashboard/types';

export type ProjectListRow = {
  id: string;
  name: string;
  brand: string | null;
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
  brand?: string;
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

export type ProjectStatus = 'Open' | 'On Track' | 'At Risk' | 'Closed';
export type ProjectPdcaPhase = 'PLAN' | 'DO' | 'CHECK' | 'ACT' | 'CLOSED';

export type ProjectMemberRole = 'Owner' | 'Leader' | 'Member';

export type ProjectMemberInput = {
  user: string;
  role: ProjectMemberRole;
  is_also_leader?: boolean;
};

export type UserOption = {
  user: string;
  full_name: string;
  email: string;
  avatar: string | null;
};

export type ProjectFormValues = {
  title: string;
  brand: string;
  project_owner: string;
  project_leader?: string;
  start_date: string;
  end_date: string;
  status?: ProjectStatus;
  pdca_phase?: ProjectPdcaPhase;
  objective?: string;
  blocked_days_threshold?: number | null;
  slip_pct_threshold?: number | null;
  capacity_pct_threshold?: number | null;
  team_members?: ProjectMemberInput[];
};

export type ProjectPermissions = {
  can_create: boolean;
  can_write: boolean;
  can_delete: boolean;
};

export type ProjectDetail = {
  id: string;
  title: string;
  brand?: string | null;
  project_owner?: string | null;
  project_leader?: string | null;
  project_lead: string | null;
  health_score: number;
  percent_done: number;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  pdca_phase?: string | null;
  active_sprint: { id?: string; name: string; days_left?: number; title?: string } | null;
  linked_objective: string | null;
  blocked_count: number;
  blocked_days_threshold?: number | null;
  slip_pct_threshold?: number | null;
  capacity_pct_threshold?: number | null;
  team_members?: ProjectMemberInput[];
};
