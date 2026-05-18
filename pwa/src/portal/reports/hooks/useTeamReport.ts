import { useQuery } from "@tanstack/react-query";
import {
  getPortalLeaderboard,
  getPortalWorkload,
  getPortalOverdue,
} from "../api/portal_reports";

export function useTeamReport(period: string) {
  const leaderboard = useQuery({
    queryKey: ["reports", "leaderboard", period],
    queryFn: () => getPortalLeaderboard(period, 20),
    staleTime: 5 * 60 * 1000,
  });
  const workload = useQuery({
    queryKey: ["reports", "workload"],
    queryFn: () => getPortalWorkload(),
    staleTime: 5 * 60 * 1000,
  });
  const overdue = useQuery({
    queryKey: ["reports", "overdue"],
    queryFn: () => getPortalOverdue(),
    staleTime: 5 * 60 * 1000,
  });
  return { leaderboard, workload, overdue };
}
