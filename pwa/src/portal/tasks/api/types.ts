import type { KanbanStatus, PdcaPhase } from "../../sprints/api/types";

export type ActivityEntryType = "comment" | "version";
export type CommentType = "Comment" | "Info";

export interface CommentEntry {
  type: "comment";
  name: string;
  owner: string;
  creation: string;
  content: string;
  comment_type: CommentType;
}

export interface VersionEntry {
  type: "version";
  name: string;
  owner: string;
  creation: string;
  changes: [string, string | null, string | null][];
}

export type ActivityEntry = CommentEntry | VersionEntry;

export interface TaskDetail {
  task: {
    name: string;
    title: string;
    deadline: string | null;
    assigned_to: string | null;
    assigned_to_full_name: string | null;
    kanban_status: KanbanStatus;
    priority: "Low" | "Medium" | "High" | "Critical";
    base_points: number;
    pdca_phase: PdcaPhase;
    completion_date: string | null;
    project: string;
    sprint: string;
    estimated_hours: number;
    kanban_rank: number | null;
  };
  permitted_fields: string[];
}

export interface CreateTaskPayload {
  sprint: string;
  project: string;
  title: string;
  priority?: "Low" | "Medium" | "High" | "Critical";
  estimated_hours?: number;
  deadline?: string;
  assigned_to?: string;
  pdca_phase?: PdcaPhase;
  kanban_status?: KanbanStatus;
}

export interface UpdateTaskPayload {
  title?: string;
  deadline?: string | null;
  assigned_to?: string | null;
  kanban_status?: KanbanStatus;
  priority?: "Low" | "Medium" | "High" | "Critical";
  estimated_hours?: number;
  pdca_phase?: PdcaPhase;
}
