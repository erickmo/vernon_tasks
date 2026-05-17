import { Routes, Route } from "react-router-dom";
import { OKRList } from "./OKRList";
import { ObjectiveEditor } from "./ObjectiveEditor";

export function OKRRoutes() {
  return (
    <Routes>
      <Route index element={<OKRList />} />
      <Route path="new" element={<ObjectiveEditor mode="create" />} />
      <Route path=":id/edit" element={<ObjectiveEditor mode="edit" />} />
    </Routes>
  );
}
