import { useQuery } from "@tanstack/react-query";
import {
  getPortalHealthScore,
  getPortalOkrRollup,
} from "../api/portal_reports";

export function useOkrReport(period?: string) {
  const health = useQuery({
    queryKey: ["reports", "health"],
    queryFn: () => getPortalHealthScore(),
    staleTime: 5 * 60 * 1000,
  });
  const rollup = useQuery({
    queryKey: ["reports", "okr", period ?? "current"],
    queryFn: () => getPortalOkrRollup(period),
    staleTime: 5 * 60 * 1000,
  });
  return { health, rollup };
}
