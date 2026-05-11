import { api } from "./client";

const BASE = "/api/method/vernon_tasks.task.api.ic_analytics";

export type Period = "week" | "month" | "quarter";

export interface LeaderboardRow {
  user: string;
  points: number;
  task_count: number;
}

export interface VelocityTrend {
  sprints: string[];
  personal: number[];
  team_avg: number[];
  avg: number;
  team_avg_total: number;
}

export interface StreakResult {
  streak: number;
  sprints_checked: number;
}

export const fetchLeaderboard = (period: Period = "month", limit = 10) =>
  api.get<LeaderboardRow[]>(`${BASE}.get_leaderboard?period=${period}&limit=${limit}`);

export const fetchVelocity = (project: string, n = 6) =>
  api.get<VelocityTrend>(
    `${BASE}.get_personal_velocity?project=${encodeURIComponent(project)}&n=${n}`,
  );

export const fetchStreak = (project: string) =>
  api.get<StreakResult>(`${BASE}.get_streak?project=${encodeURIComponent(project)}`);
