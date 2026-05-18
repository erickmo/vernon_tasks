import { useQuery } from "@tanstack/react-query";
import { portalDashboardApi } from "../api/portalDashboard";
import { dashboardKeys } from "./useDashboardSummary";

export function usePortfolioSummary() {
  return useQuery({
    queryKey: dashboardKeys.portfolio,
    queryFn: () => portalDashboardApi.getPortfolioSummary(),
    staleTime: 60_000,
  });
}
