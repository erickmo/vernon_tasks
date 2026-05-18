import { useQuery } from "@tanstack/react-query";
import {
  getPortalVelocityComparison,
  getPortalForecasts,
  getPortalRisks,
} from "../api/portal_reports";

export function useSprintsReport(n: number) {
  const velocity = useQuery({
    queryKey: ["reports", "velocity", n],
    queryFn: () => getPortalVelocityComparison(n),
    staleTime: 5 * 60 * 1000,
  });
  const forecasts = useQuery({
    queryKey: ["reports", "forecasts"],
    queryFn: () => getPortalForecasts(),
    staleTime: 5 * 60 * 1000,
  });
  const risks = useQuery({
    queryKey: ["reports", "risks"],
    queryFn: () => getPortalRisks(),
    staleTime: 2 * 60 * 1000,
  });
  return { velocity, forecasts, risks };
}
