export type SprintStatus = "Planning" | "Active" | "Review" | "Closed";
export type KanbanStatus = "Backlog" | "Scheduled" | "In Progress" | "In Review" | "Revision" | "Done" | "Blocked";
export type PdcaPhase = "BACKLOG" | "PLAN" | "DO" | "CHECK" | "ACT" | "DONE";
export type BoardAxis = "kanban_status" | "pdca_phase";

export interface SprintRow {
  name: string;
  sprint_title: string;
  project: string;
  start_date: string | null;
  end_date: string | null;
  status: SprintStatus;
  goal: string | null;
  modified: string;
  task_count: number;
  open_hours: number;
  completed_hours: number;
}

export interface TaskCardData {
  name: string;
  title: string;
  assigned_to: string | null;
  kanban_status: KanbanStatus;
  pdca_phase: PdcaPhase;
  kanban_rank: number | null;
  estimated_hours: number;
  weight: number;
  priority: "Low" | "Medium" | "High" | "Critical";
  deadline: string | null;
}

export interface SprintDetail {
  sprint: {
    name: string;
    sprint_title: string;
    project: string;
    start_date: string | null;
    end_date: string | null;
    status: SprintStatus;
    goal: string | null;
  };
  project_summary: {
    name: string;
    title: string;
    status: string;
    pdca_phase: string;
    start_date: string;
    end_date: string;
  } | null;
  tasks: TaskCardData[];
}

export interface BurndownPoint { date: string; remaining: number; ideal: number; }
export interface BurndownSeries {
  sprint: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  series: BurndownPoint[];
}

export interface MoveTaskPayload {
  task: string;
  kanban_status?: KanbanStatus;
  pdca_phase?: PdcaPhase;
  kanban_rank?: number;
  sprint?: string | null;
}

export interface SprintFilters { statuses?: SprintStatus[]; period_start?: string; period_end?: string; }
export interface CreateSprintPayload {
  sprint_title: string;
  project: string;
  start_date: string;
  end_date: string;
  status?: SprintStatus;
  goal?: string;
}
export interface UpdateSprintPayload {
  sprint_title?: string;
  start_date?: string;
  end_date?: string;
  status?: SprintStatus;
  goal?: string;
}
