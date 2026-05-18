import { type HTMLAttributes } from "react";
import { useTeamPulse } from "../hooks/useTeamPulse";
import { useUnassignedTasks } from "../hooks/useUnassignedTasks";
import { TeamPulseGrid } from "../widgets/TeamPulseGrid";
import { UnassignedTaskList } from "../widgets/UnassignedTaskList";
import type { TeamMember, UnassignedTask } from "../api/portalDashboard";

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onHelp: (m: TeamMember) => void;
  onReview: (m: TeamMember) => void;
  onAssign: (t: UnassignedTask) => void;
  dragHandleProps?: HTMLAttributes<HTMLSpanElement>;
}

export function LeaderSection({ collapsed, onToggleCollapse, onHelp, onReview, onAssign, dragHandleProps }: Props) {
  const pulse = useTeamPulse();
  const unassigned = useUnassignedTasks();

  const blockedCount = pulse.data?.filter((m) => m.status === "blocked").length ?? 0;
  const unassignedCount = unassigned.data?.length ?? 0;

  return (
    <>
      <div className="db-section__strip db-section__strip--leader" />
      <div className="db-section__header" onClick={onToggleCollapse}>
        <span className="db-section__drag" {...dragHandleProps}>⠿</span>
        <span className="db-section__icon">🎯</span>
        <div>
          <div className="db-section__title">As Project Leader</div>
          <div className="db-section__subtitle">Selesaikan dulu — keputusan kamu blok orang lain</div>
        </div>
        <div className="db-section__badges">
          {blockedCount > 0 && (
            <span className="db-badge db-badge--red">{blockedCount} Blocked</span>
          )}
          {unassignedCount > 0 && (
            <span className="db-badge db-badge--amber">{unassignedCount} Unassigned</span>
          )}
        </div>
        <span className={`db-section__collapse${collapsed ? " db-section__collapse--collapsed" : ""}`}>▾</span>
      </div>
      <div className={`db-section__body${collapsed ? " db-section__body--hidden" : ""}`}>
        <div className="db-sub-label">👥 Team Pulse</div>
        {pulse.isLoading ? (
          <div style={{ fontSize: 11, color: "#6b63a0" }}>Memuat…</div>
        ) : (
          <TeamPulseGrid
            members={pulse.data ?? []}
            onHelp={onHelp}
            onReview={onReview}
          />
        )}
        <div className="db-sub-label" style={{ marginTop: 4 }}>📥 Unassigned Tasks</div>
        {unassigned.isLoading ? (
          <div style={{ fontSize: 11, color: "#6b63a0" }}>Memuat…</div>
        ) : (
          <UnassignedTaskList tasks={unassigned.data ?? []} onAssign={onAssign} />
        )}
      </div>
    </>
  );
}
