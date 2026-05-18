import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listSprints, bulkUpdateSprints } from "../api/sprints";
import type { SprintRow, SprintStatus } from "../api/types";

export function useSprintBoard(projectId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["sprintBoard", projectId],
    queryFn: () => listSprints(projectId),
    enabled: !!projectId,
  });

  const moveSprint = useMutation({
    mutationFn: async ({ name, toStatus }: { name: string; toStatus: SprintStatus }) => {
      const prev = qc.getQueryData<SprintRow[]>(["sprintBoard", projectId]);
      if (prev) {
        qc.setQueryData<SprintRow[]>(["sprintBoard", projectId],
          prev.map(s => s.name === name ? { ...s, status: toStatus } : s));
      }
      try {
        return await bulkUpdateSprints([name], { status: toStatus });
      } catch (e) {
        if (prev) qc.setQueryData(["sprintBoard", projectId], prev);
        throw e;
      }
    },
  });

  return { ...query, moveSprint };
}
