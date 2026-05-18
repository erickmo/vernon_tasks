import { Routes, Route } from "react-router-dom";
import { SprintBoard } from "./SprintBoard";
import { SprintDetail } from "./SprintDetail";

export function SprintRoutes() {
  return (
    <Routes>
      <Route index element={<SprintBoard />} />
      <Route path=":sprintId" element={<SprintDetail />} />
    </Routes>
  );
}
