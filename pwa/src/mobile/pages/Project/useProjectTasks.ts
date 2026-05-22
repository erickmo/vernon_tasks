import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProjectTasks, type TaskFilters } from "./api";

export const projectTaskKeys = {
  all: ["project-tasks"] as const,
  list: (project: string, filters: TaskFilters) =>
    [...projectTaskKeys.all, project, filters] as const,
};

export function useProjectTasks(
  projectId: string | null,
  filters: TaskFilters = {},
) {
  return useQuery({
    queryKey: projectTaskKeys.list(projectId ?? "", filters),
    queryFn: () => getProjectTasks(projectId!, filters),
    enabled: projectId !== null,
    staleTime: 60_000,
  });
}

export function useInvalidateProjectTasks() {
  const qc = useQueryClient();
  return (projectId: string) =>
    qc.invalidateQueries({ queryKey: [projectTaskKeys.all[0], projectId] });
}
