import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTaskDetail } from "../api/tasks";
import type { TaskDetail } from "../api/types";
import type { SprintDetail, TaskCardData } from "../../sprints/api/types";

export function useTaskDetail(taskName: string | null, sprintId: string) {
  const qc = useQueryClient();

  return useQuery<TaskDetail>({
    queryKey: ["taskDetail", taskName],
    queryFn: () => getTaskDetail(taskName!),
    enabled: !!taskName,
    staleTime: 30_000,
    placeholderData: () => {
      const sprintData = qc.getQueryData<SprintDetail>(["sprintDetail", sprintId]);
      if (!sprintData || !taskName) return undefined;
      const found = sprintData.tasks.find((t: TaskCardData) => t.name === taskName);
      if (!found) return undefined;
      return {
        task: {
          name: found.name,
          title: found.title,
          deadline: found.deadline ?? null,
          assigned_to: found.assigned_to,
          assigned_to_full_name: null,
          kanban_status: found.kanban_status,
          priority: found.priority,
          base_points: 0,
          pdca_phase: found.pdca_phase,
          completion_date: null,
          project: sprintData.sprint.project,
          sprint: sprintData.sprint.name,
          estimated_hours: found.estimated_hours,
          kanban_rank: found.kanban_rank,
        },
        permitted_fields: [],
      } satisfies TaskDetail;
    },
  });
}
