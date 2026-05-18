import { useQuery } from "@tanstack/react-query";
import { getSprintBurndown } from "../api/sprints";

export function useBurndown(sprintId: string) {
  return useQuery({
    queryKey: ["burndown", sprintId],
    queryFn: () => getSprintBurndown(sprintId),
    enabled: !!sprintId,
    staleTime: 60_000,
  });
}
