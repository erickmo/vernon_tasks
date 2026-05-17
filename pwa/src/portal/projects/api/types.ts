import type { ProjectStatus } from "../lib/projectStatus";
export type { ProjectStatus } from "../lib/projectStatus";

export type PdcaPhase = "PLAN" | "DO" | "CHECK" | "ACT" | "CLOSED";

export interface ProjectRow {
  name: string;
  title: string;
  project_owner: string;
  project_leader: string;
  start_date: string | null;
  end_date: string | null;
  status: ProjectStatus;
  pdca_phase: PdcaPhase;
  objective: string | null;
  linked_objective_title: string | null;
  team_count: number;
  milestone_count: number;
  sprint_count: number;
  modified: string;
}

export interface LinkedObjectiveSummary {
  name: string;
  title: string;
  period: string;
  status: string;
  avg_kr_progress: number;
}

export interface ProjectCounts {
  team_members: number;
  milestones: number;
  sprints: number;
  documentation: number;
}

export interface ProjectDetail {
  project: Record<string, unknown> & { name: string; objective?: string | null };
  linked_objective_summary: LinkedObjectiveSummary | null;
  counts: ProjectCounts;
}

export interface ListFilters {
  period_start?: string | null;
  period_end?: string | null;
  statuses?: string[];
  pdca_phases?: string[];
  leaders?: string[];
  owners?: string[];
}

export interface BulkUpdatePayload {
  status?: ProjectStatus;
  pdca_phase?: PdcaPhase | "__next__";
}

export interface BulkUpdateResult {
  updated: { name: string; changes: Record<string, string> }[];
  skipped: { name: string; reason: string }[];
}
