import { api } from '@/lib/api';
import type { Worksheet, TeamWorksheetRow } from './types';

const BASE = '/api/method/vernon_tasks.task.api.portal_worksheet';

export const WORKSHEET_KEY = (weekStart: string) => ['worksheet', weekStart] as const;
export const TEAM_WORKSHEET_KEY = (weekStart: string) => ['worksheet', 'team', weekStart] as const;

export async function getWorksheet(week_start: string): Promise<Worksheet> {
  const res = await api.get<{ message: Worksheet }>(`${BASE}.get_worksheet`, { params: { week_start } });
  return res.data.message;
}

export async function scheduleTask(args: { task_id: string; date: string; hour_start?: number; hours?: number }) {
  const res = await api.post<{ message: { entry_id: string } }>(`${BASE}.schedule_task`, args);
  return res.data.message;
}

export async function updateEntry(entry_id: string, patch: { date?: string; hour_start?: number; hours?: number }) {
  await api.post(`${BASE}.update_entry`, { entry_id, ...patch });
}

export async function unschedule(entry_id: string) {
  await api.post(`${BASE}.unschedule`, { entry_id });
}

export async function bulkCarryOver(week_start: string) {
  const res = await api.post<{ message: { moved: number } }>(`${BASE}.bulk_carry_over`, { week_start });
  return res.data.message.moved;
}

export async function getTeamWorksheet(week_start: string): Promise<TeamWorksheetRow[]> {
  const res = await api.get<{ message: TeamWorksheetRow[] }>(`${BASE}.get_team_worksheet`, { params: { week_start } });
  return res.data.message;
}
