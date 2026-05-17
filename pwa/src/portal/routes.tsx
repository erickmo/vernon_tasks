import { Routes, Route } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { NotFound } from "./pages/NotFound";
import { ComingSoon } from "./pages/ComingSoon";
import { RequirePermission } from "./guards/RequirePermission";

export function PortalRoutes() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route
        path="okr/*"
        element={<RequirePermission perm="okr.read"><ComingSoon domain="OKR" /></RequirePermission>}
      />
      <Route
        path="projects/*"
        element={<RequirePermission perm="project.read"><ComingSoon domain="Projects" /></RequirePermission>}
      />
      <Route
        path="workforce/*"
        element={<RequirePermission perm="workforce.read"><ComingSoon domain="Workforce" /></RequirePermission>}
      />
      <Route
        path="reports/*"
        element={<RequirePermission perm="report.read"><ComingSoon domain="Reports" /></RequirePermission>}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
