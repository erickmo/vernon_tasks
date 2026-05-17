import { useQuery } from "@tanstack/react-query";
import { listObjectives } from "../api/objectives";
import type { ListFilters } from "../api/types";
import { okrKeys } from "./keys";

export function useObjectives(filters: ListFilters) {
  return useQuery({
    queryKey: okrKeys.list(filters),
    queryFn: () => listObjectives(filters),
    staleTime: 30_000,
  });
}
