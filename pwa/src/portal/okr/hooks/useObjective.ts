import { useQuery } from "@tanstack/react-query";
import { getObjectiveWithKrs } from "../api/objectives";
import { okrKeys } from "./keys";

export function useObjective(name: string | null | undefined) {
  return useQuery({
    queryKey: okrKeys.detail(name ?? "__none__"),
    queryFn: () => getObjectiveWithKrs(name as string),
    enabled: !!name,
    staleTime: 30_000,
  });
}
