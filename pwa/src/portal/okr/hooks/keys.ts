import type { ListFilters } from "../api/types";

export const okrKeys = {
  all: ["okr"] as const,
  lists: () => [...okrKeys.all, "list"] as const,
  list: (filters: ListFilters) => [...okrKeys.lists(), filters] as const,
  details: () => [...okrKeys.all, "detail"] as const,
  detail: (name: string) => [...okrKeys.details(), name] as const,
};
