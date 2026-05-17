import { useQuery } from "@tanstack/react-query";
import { fetchUserPermissions } from "../api/permissions";

export const USER_PERMISSIONS_QUERY_KEY = ["auth", "permissions"] as const;

export function usePermissions() {
  const { data, isLoading } = useQuery({
    queryKey: USER_PERMISSIONS_QUERY_KEY,
    queryFn: fetchUserPermissions,
    staleTime: 5 * 60 * 1000,
  });
  const perms = new Set(data?.permissions ?? []);
  const roles = new Set(data?.roles ?? []);
  return {
    isLoading,
    permissions: data?.permissions ?? [],
    roles: data?.roles ?? [],
    hasPermission: (p: string) => perms.has(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => perms.has(p)),
    hasRole: (r: string) => roles.has(r),
  };
}
