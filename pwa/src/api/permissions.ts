import { api } from "./client";

export interface UserPermissions {
  permissions: string[];
  roles: string[];
}

const EMPTY: UserPermissions = { permissions: [], roles: [] };

export async function fetchUserPermissions(): Promise<UserPermissions> {
  const res = await api.get<UserPermissions | undefined>(
    "/api/method/vernon_tasks.api.auth.get_user_permissions",
  );
  return res ?? EMPTY;
}
