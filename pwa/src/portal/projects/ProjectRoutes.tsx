import { Routes, Route } from "react-router-dom";
import { ProjectList } from "./ProjectList";
import { ProjectEditor } from "./ProjectEditor";
import { SprintsFeatureGate } from "../sprints/SprintsFeatureGate";
import { SprintRoutes } from "../sprints/SprintRoutes";

export function ProjectRoutes() {
  return (
    <Routes>
      <Route index element={<ProjectList />} />
      <Route path="new" element={<ProjectEditor mode="create" />} />
      <Route path=":id/edit" element={<ProjectEditor mode="edit" />} />
      <Route
        path=":projectId/sprints/*"
        element={<SprintsFeatureGate><SprintRoutes /></SprintsFeatureGate>}
      />
    </Routes>
  );
}
