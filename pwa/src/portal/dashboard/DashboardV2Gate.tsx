// pwa/src/portal/dashboard/DashboardV2Gate.tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { DashboardPage } from "./DashboardPage";

export function DashboardV2Gate() {
  const flag = useQuery({
    queryKey: ["settings", "dashboard_v2"],
    queryFn: () =>
      api.get<{ portal_dashboard_v2_enabled: 0 | 1 }>(
        "/api/method/frappe.client.get_value",
        { doctype: "VT Settings", fieldname: "portal_dashboard_v2_enabled" }
      ),
    staleTime: 5 * 60_000,
  });

  if (flag.data?.portal_dashboard_v2_enabled === 1) {
    return <DashboardPage />;
  }
  return null;
}
