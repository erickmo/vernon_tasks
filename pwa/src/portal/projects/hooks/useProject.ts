import { useQuery } from "@tanstack/react-query";
import * as projApi from "../api/projects";
import { projectKeys } from "./keys";

export function useProject(name: string | null | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(name ?? "__none__"),
    queryFn: () => projApi.getProjectWithRelations(name as string),
    enabled: !!name,
    staleTime: 30_000,
  });
}
