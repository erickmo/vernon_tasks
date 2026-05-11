import { api } from "./client";
import { TaskCard } from "./tasks";

export type DueRange = "all" | "today" | "week" | "overdue";

export interface SearchFilters {
  query?: string;
  priority?: string[];
  project?: string;
  due_range?: DueRange;
}

export interface SearchResult {
  results: TaskCard[];
  total: number;
}

export function fetchSearchResults(f: SearchFilters): Promise<SearchResult> {
  const params = new URLSearchParams();
  if (f.query) params.set("query", f.query);
  if (f.priority?.length) params.set("priority", f.priority.join(","));
  if (f.project) params.set("project", f.project);
  if (f.due_range && f.due_range !== "all") params.set("due_range", f.due_range);
  const qs = params.toString();
  return api.get<SearchResult>(
    `/api/method/vernon_tasks.task.api.my_work.search${qs ? "?" + qs : ""}`,
  );
}

export function filtersActive(f: SearchFilters): boolean {
  return Boolean(
    (f.query && f.query.length > 0) ||
      (f.priority && f.priority.length > 0) ||
      f.project ||
      (f.due_range && f.due_range !== "all"),
  );
}
