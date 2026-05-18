export interface ObjectiveRow {
  name: string;
  title: string;
  period: string;
  period_start: string | null;
  period_end: string | null;
  objective_owner: string;
  status: "Open" | "On Track" | "At Risk" | "Closed";
  pdca_phase: "PLAN" | "DO" | "CHECK" | "ACT" | "CLOSED";
  modified: string;
  progress_avg: number;
}

export interface KeyResult {
  name: string;
  objective?: string;
  metric: string;
  target_value: number;
  current_value: number;
  unit: string | null;
  progress_percent: number;
  modified: string;
}

export interface ObjectiveDetail {
  objective: Record<string, unknown> & { name: string };
  key_results: KeyResult[];
}

export interface ListFilters {
  period_start?: string | null;
  period_end?: string | null;
  owners?: string[];
  statuses?: string[];
  pdca_phases?: string[];
}

export interface BulkAdvanceResult {
  advanced: { name: string; from: string; to: string }[];
  skipped: { name: string; reason: string }[];
}
