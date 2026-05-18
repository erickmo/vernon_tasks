import { useQuery } from "@tanstack/react-query";
import * as projApi from "../api/projects";
import type { ListFilters } from "../api/types";
import { projectKeys } from "./keys";

export function useProjects(filters: ListFilters) {
  return useQuery({
    queryKey: projectKeys.list(filters),
    queryFn: () => projApi.listProjects(filters),
    staleTime: 30_000,
  });
}
