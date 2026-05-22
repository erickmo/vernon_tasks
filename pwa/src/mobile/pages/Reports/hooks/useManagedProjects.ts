import { useQuery } from "@tanstack/react-query";
import { listManagedProjects, ManagedProject } from "../../../../api/reports";

export interface UseManagedProjectsResult {
  projects: ManagedProject[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Fetches projects the current user manages with KPI snippet. 60s stale. */
export function useManagedProjects(): UseManagedProjectsResult {
  const q = useQuery({
    queryKey: ["reports", "managed-projects"],
    queryFn: () => listManagedProjects().then((r) => r.projects),
    staleTime: 60_000,
  });
  return {
    projects: q.data ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}
