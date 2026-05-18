import { useState, useEffect, lazy, Suspense } from "react";
import { usePermissions } from "../../auth/usePermissions";
import { PermissionDenied } from "../pages/PermissionDenied";
import { PageSkeleton } from "../../components/PageSkeleton";
import {
  trackReportsPageView,
  trackReportsTabView,
  trackReportsPermissionDenied,
} from "../../telemetry";

const OkrTab     = lazy(() => import("./tabs/OkrTab").then((m) => ({ default: m.OkrTab })));
const SprintsTab = lazy(() => import("./tabs/SprintsTab").then((m) => ({ default: m.SprintsTab })));
const TeamTab    = lazy(() => import("./tabs/TeamTab").then((m) => ({ default: m.TeamTab })));

type TabKey = "okr" | "sprints" | "team";

interface TabDef {
  key: TabKey;
  label: string;
}

export function ReportsPage() {
  const { isLoading, roles } = usePermissions();
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);

  const isManager = roles.includes("VT Manager") || roles.includes("System Manager");
  const isLeader  = roles.includes("VT Leader");

  const tabs: TabDef[] = [
    ...(isManager                    ? [{ key: "okr"     as TabKey, label: "OKR" }]     : []),
    ...(isManager || isLeader        ? [{ key: "sprints" as TabKey, label: "Sprints" }] : []),
    ...(isManager || isLeader        ? [{ key: "team"    as TabKey, label: "Team" }]    : []),
  ];

  // Set default tab once permissions resolve
  useEffect(() => {
    if (!isLoading && tabs.length > 0 && activeTab === null) {
      setActiveTab(tabs[0].key);
    }
  }, [isLoading, tabs.length]);

  // Track page view on mount
  useEffect(() => {
    trackReportsPageView();
  }, []);

  // Track tab view on tab change
  useEffect(() => {
    if (activeTab) {
      trackReportsTabView(activeTab);
    }
  }, [activeTab]);

  if (isLoading) return <PageSkeleton />;

  if (tabs.length === 0) {
    trackReportsPermissionDenied("reports");
    return <PermissionDenied requiredPerm="report.read" />;
  }

  return (
    <div className="reports-page">
      <div role="tablist" className="reports-tab-bar">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={activeTab === t.key}
            className={`reports-tab ${activeTab === t.key ? "active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="reports-tab-content">
        <Suspense fallback={<PageSkeleton />}>
          {activeTab === "okr"     && isManager && <OkrTab />}
          {activeTab === "sprints" && (isManager || isLeader) && <SprintsTab />}
          {activeTab === "team"    && (isManager || isLeader) && <TeamTab />}
        </Suspense>
      </div>
    </div>
  );
}
