import { useQuery } from "@tanstack/react-query";
import { fetchMyWork } from "../api/tasks";

export function useUserProjects() {
  const q = useQuery({ queryKey: ["my-work"], queryFn: fetchMyWork });
  const set = new Set<string>();
  for (const list of [q.data?.overdue, q.data?.today, q.data?.upcoming]) {
    list?.forEach((t) => {
      if (t.project) set.add(t.project);
    });
  }
  return { projects: Array.from(set).sort(), isLoading: q.isLoading };
}
