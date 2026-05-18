import { useQuery } from "@tanstack/react-query";
import { portalDashboardApi } from "../api/portalDashboard";

export const dashboardKeys = {
  summary: ["dashboard", "summary"] as const,
  teamPulse: (project?: string) => ["dashboard", "teamPulse", project] as const,
  unassigned: (project?: string) => ["dashboard", "unassigned", project] as const,
  timeline: (back: number, fwd: number) => ["dashboard", "timeline", back, fwd] as const,
  portfolio: ["dashboard", "portfolio"] as const,
};

export function useDashboardSummary() {
  return useQuery({
    queryKey: dashboardKeys.summary,
    queryFn: () => portalDashboardApi.getSummary(),
    staleTime: 60_000,
  });
}
