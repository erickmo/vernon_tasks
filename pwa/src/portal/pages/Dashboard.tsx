import { PageLayout } from "../layouts/PageLayout";
import { portalNav } from "../nav";
import * as permsHook from "../../auth/usePermissions";

export function Dashboard() {
  const { hasPermission } = permsHook.usePermissions();
  const domains = portalNav.filter((n) => n.key !== "dashboard");
  return (
    <PageLayout title="Dashboard">
      <div className="portal-dashboard__grid">
        {domains.map((d) => {
          const allowed = d.permission === null || hasPermission(d.permission);
          return (
            <article key={d.key} className="portal-card" aria-disabled={!allowed}>
              <h2>{d.label}</h2>
              <p>{allowed ? "Coming soon" : "No access"}</p>
            </article>
          );
        })}
      </div>
    </PageLayout>
  );
}
