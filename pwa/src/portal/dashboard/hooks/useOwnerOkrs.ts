import { useQuery } from "@tanstack/react-query";
import { portalDashboardApi } from "../api/portalDashboard";
import { dashboardKeys } from "./useDashboardSummary";

export function useOwnerOkrs(enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.ownerOkrs,
    queryFn: () => portalDashboardApi.getOwnerOkrs(),
    enabled,
    staleTime: 60_000,
  });
}
