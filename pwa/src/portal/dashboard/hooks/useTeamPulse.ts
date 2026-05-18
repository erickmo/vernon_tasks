import { useQuery } from "@tanstack/react-query";
import { portalDashboardApi } from "../api/portalDashboard";
import { dashboardKeys } from "./useDashboardSummary";

export function useTeamPulse(project?: string) {
  return useQuery({
    queryKey: dashboardKeys.teamPulse(project),
    queryFn: () => portalDashboardApi.getTeamPulse(project),
    staleTime: 30_000,
  });
}
