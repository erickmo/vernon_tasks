/**
 * DashboardPage — Portal dashboard root component.
 * Assembles Leader / Owner / Member sections with drag-reorder and collapse.
 * Layer: Page/Route component
 * PRD ref: portal-dashboard-p6
 */
import { useState, useCallback, type DragEvent } from "react";
import { usePermissions } from "../../auth/usePermissions";
import { useDashboardSummary } from "./hooks/useDashboardSummary";
import { useOwnerOkrs } from "./hooks/useOwnerOkrs";
import { getSectionOrder, saveSectionOrder, type SectionId } from "./hooks/useSectionOrder";
import { getCollapseState, toggleCollapseState } from "./hooks/useSectionCollapse";
import { SummaryBar } from "./SummaryBar";
import { LeaderSection } from "./sections/LeaderSection";
import { OwnerSection } from "./sections/OwnerSection";
import { MemberSection } from "./sections/MemberSection";
import type { TeamMember, UnassignedTask } from "./api/portalDashboard";
import "./dashboard.css";

/** Roles that can see the Leader section. */
const LEADER_ROLES = new Set(["VT Manager", "VT Leader", "System Manager"]);

/** Roles that can see the Owner section. */
const OWNER_ROLES = new Set(["VT Manager", "System Manager"]);

/**
 * DashboardPage renders the full portal dashboard.
 * Sections are conditionally shown based on user roles and
 * support drag-to-reorder (order persisted in localStorage).
 */
export function DashboardPage() {
  const { roles } = usePermissions();
  const isLeader = roles.some((r) => LEADER_ROLES.has(r));
  const isOwner = roles.some((r) => OWNER_ROLES.has(r));

  const summary = useDashboardSummary();

  // Section order persisted in localStorage via useSectionOrder helpers.
  const [order, setOrder] = useState<SectionId[]>(getSectionOrder);
  // Collapse state persisted in localStorage via useSectionCollapse helpers.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(getCollapseState);
  const [dragOver, setDragOver] = useState<SectionId | null>(null);
  const [dragging, setDragging] = useState<SectionId | null>(null);

  /** Toggle collapse for a given section id, persisting state. */
  const handleToggleCollapse = useCallback((id: SectionId) => {
    const next = toggleCollapseState(id);
    setCollapsed((prev) => ({ ...prev, [id]: next }));
  }, []);

  const handleDragStart = (id: SectionId) => setDragging(id);

  const handleDragOver = (id: SectionId) => (e: DragEvent) => {
    e.preventDefault();
    setDragOver(id);
  };

  /** Drop handler: reorder sections and persist new order. */
  const handleDrop = (target: SectionId) => {
    if (!dragging || dragging === target) {
      setDragging(null);
      setDragOver(null);
      return;
    }
    const next = [...order];
    const fromIdx = next.indexOf(dragging);
    const toIdx = next.indexOf(target);
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragging);
    setOrder(next);
    saveSectionOrder(next);
    setDragging(null);
    setDragOver(null);
  };

  const handleDragEnd = () => {
    setDragging(null);
    setDragOver(null);
  };

  // Filter to only sections visible for this user's roles.
  const visibleOrder = order.filter((id) => {
    if (id === "leader") return isLeader;
    if (id === "owner") return isOwner;
    return true; // "member" is always visible
  });

  const ownerOkrsQuery = useOwnerOkrs(isOwner);
  const okrs = ownerOkrsQuery.data ?? [];

  return (
    <div className="db-root">
      {summary.data && (
        <SummaryBar summary={summary.data} isLeader={isLeader} />
      )}

      <div className="db-drag-hint">⠿ Drag section untuk ubah urutan</div>

      {visibleOrder.map((id) => (
        <div
          key={id}
          className={[
            "db-section",
            dragging === id ? "db-section--dragging" : "",
            dragOver === id ? "db-section--drag-over" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          draggable
          onDragStart={() => handleDragStart(id)}
          onDragOver={handleDragOver(id)}
          onDrop={() => handleDrop(id)}
          onDragEnd={handleDragEnd}
        >
          {id === "leader" && isLeader && (
            <LeaderSection
              collapsed={!!collapsed.leader}
              onToggleCollapse={() => handleToggleCollapse("leader")}
              onHelp={(m: TeamMember) =>
                window.open(`/portal/projects?task=${m.task_id}`, "_self")
              }
              onReview={(m: TeamMember) =>
                window.open(`/portal/projects?task=${m.task_id}`, "_self")
              }
              onAssign={(_t: UnassignedTask) => {
                /* P6.2: open assign modal */
              }}
            />
          )}
          {id === "owner" && isOwner && (
            <OwnerSection
              okrs={okrs}
              collapsed={!!collapsed.owner}
              onToggleCollapse={() => handleToggleCollapse("owner")}
            />
          )}
          {id === "member" && (
            <MemberSection
              tasks={[]}
              collapsed={!!collapsed.member}
              onToggleCollapse={() => handleToggleCollapse("member")}
            />
          )}
        </div>
      ))}
    </div>
  );
}
