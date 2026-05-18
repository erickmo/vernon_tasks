import { ReportsFeatureGate } from "./ReportsFeatureGate";
import { ReportsPage } from "./ReportsPage";

export function ReportsRoutes() {
  return (
    <ReportsFeatureGate>
      <ReportsPage />
    </ReportsFeatureGate>
  );
}
