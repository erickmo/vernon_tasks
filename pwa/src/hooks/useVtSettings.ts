import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export interface VtSettings {
  portal_enabled: boolean | 0 | 1;
  portal_okr_enabled: boolean | 0 | 1;
  portal_projects_enabled: boolean | 0 | 1;
}

async function fetchVtSettings(): Promise<VtSettings> {
  // api.get auto-unwraps Frappe's { message: ... } envelope.
  const res = await api.get<VtSettings>("/api/method/frappe.client.get_value", {
    doctype: "VT Settings",
    fieldname: JSON.stringify(["portal_enabled", "portal_okr_enabled", "portal_projects_enabled"]),
  });
  return res;
}

export function useVtSettings() {
  return useQuery({
    queryKey: ["vt_settings"],
    queryFn: fetchVtSettings,
    staleTime: 60_000,
  });
}
