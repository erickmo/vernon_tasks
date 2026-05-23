export type ScheduleEntry = {
  id: string;
  task_id: string;
  title: string;
  pdca: string;
  points: number;
  linked_kr: string | null;
  project: string;
  hour_start: number;
  hours_planned: number;
};

export type UnscheduledTask = {
  task_id: string;
  title: string;
  pdca: string;
  points: number;
  linked_kr: string | null;
  project: string;
  due_date: string | null;
};

export type WorksheetDay = {
  date: string;
  entries: ScheduleEntry[];
  scheduled_hours: number;
};

export type Worksheet = {
  week_start: string;
  week_end: string;
  capacity_hours: number;
  days: WorksheetDay[];
  unscheduled: UnscheduledTask[];
};

export type TeamWorksheetRow = {
  user: string;
  full_name: string;
  days: Record<string, { hours: number; task_count: number }>;
};
