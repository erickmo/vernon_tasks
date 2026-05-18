import { Routes, Route } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { NotFound } from "./pages/NotFound";
import { ComingSoon } from "./pages/ComingSoon";
import { RequirePermission } from "./guards/RequirePermission";
import { OKRRoutes } from "./okr/OKRRoutes";
import { OKRFeatureGate } from "./okr/OKRFeatureGate";
import { ProjectRoutes } from "./projects/ProjectRoutes";
import { ProjectsFeatureGate } from "./projects/ProjectsFeatureGate";
import { NotificationsFeatureGate } from "./notifications/NotificationsFeatureGate";
import { NotificationsPage } from "./notifications/NotificationsPage";
import { ReportsRoutes } from "./reports/ReportsRoutes";

export function PortalRoutes() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route
        path="okr/*"
        element={
          <RequirePermission perm="okr.read">
            <OKRFeatureGate>
              <OKRRoutes />
            </OKRFeatureGate>
          </RequirePermission>
        }
      />
      <Route
        path="projects/*"
        element={
          <RequirePermission perm="project.read">
            <ProjectsFeatureGate>
              <ProjectRoutes />
            </ProjectsFeatureGate>
          </RequirePermission>
        }
      />
      <Route
        path="workforce/*"
        element={<RequirePermission perm="workforce.read"><ComingSoon domain="Workforce" /></RequirePermission>}
      />
      <Route
        path="reports/*"
        element={
          <RequirePermission perm="report.read">
            <ReportsRoutes />
          </RequirePermission>
        }
      />
      <Route
        path="notifications"
        element={
          <NotificationsFeatureGate>
            <NotificationsPage />
          </NotificationsFeatureGate>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
