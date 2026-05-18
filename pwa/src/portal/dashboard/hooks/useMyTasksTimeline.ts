import { useQuery } from "@tanstack/react-query";
import { portalDashboardApi } from "../api/portalDashboard";
import { dashboardKeys } from "./useDashboardSummary";

export function useMyTasksTimeline(daysBack = 3, daysForward = 3) {
  return useQuery({
    queryKey: dashboardKeys.timeline(daysBack, daysForward),
    queryFn: () => portalDashboardApi.getMyTasksTimeline(daysBack, daysForward),
    staleTime: 60_000,
  });
}
