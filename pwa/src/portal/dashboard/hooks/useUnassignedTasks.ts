import { useQuery } from "@tanstack/react-query";
import { portalDashboardApi } from "../api/portalDashboard";
import { dashboardKeys } from "./useDashboardSummary";

export function useUnassignedTasks(project?: string) {
  return useQuery({
    queryKey: dashboardKeys.unassigned(project),
    queryFn: () => portalDashboardApi.getUnassignedTasks(project),
    staleTime: 30_000,
  });
}
