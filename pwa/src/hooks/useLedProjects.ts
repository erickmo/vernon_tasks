import { useQuery } from "@tanstack/react-query";
import { fetchMyLedProjects } from "../api/leader";

export function useLedProjects() {
  return useQuery({
    queryKey: ["led-projects"],
    queryFn: fetchMyLedProjects,
    staleTime: 5 * 60_000,
  });
}
