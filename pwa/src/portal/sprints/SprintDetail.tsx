import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSprintWithRelations } from "./api/sprints";
import { TaskBoard } from "./TaskBoard";
import { BurndownChart } from "./BurndownChart";
import { useBurndown } from "./hooks/useBurndown";
import * as telemetry from "../../telemetry";

type Tab = "board" | "burndown";

export function SprintDetail() {
  const { sprintId } = useParams<{ sprintId: string }>();
  const [tab, setTab] = useState<Tab>("board");
  const detailQuery = useQuery({
    queryKey: ["sprintDetail", sprintId],
    queryFn: () => getSprintWithRelations(sprintId!),
    enabled: !!sprintId,
  });
  const burndownQuery = useBurndown(tab === "burndown" ? sprintId ?? "" : "");

  useEffect(() => {
    if (tab === "burndown" && sprintId) telemetry.trackBurndownView(sprintId);
  }, [tab, sprintId]);

  if (detailQuery.isLoading || !detailQuery.data) return <div>Loading…</div>;
  const d = detailQuery.data;

  return (
    <div>
      <header>
        <h2>{d.sprint.sprint_title}</h2>
        <div>{d.sprint.start_date} → {d.sprint.end_date} · {d.sprint.status}</div>
        {d.sprint.goal && <p>{d.sprint.goal}</p>}
      </header>
      <div role="tablist">
        <button role="tab" aria-selected={tab === "board"} onClick={() => setTab("board")}>Board</button>
        <button role="tab" aria-selected={tab === "burndown"} onClick={() => setTab("burndown")}>Burndown</button>
      </div>
      {tab === "board" && (
        <div data-testid="task-board-root">
          <TaskBoard detail={d} currentUser={"Administrator"} canEditAll={true} />
        </div>
      )}
      {tab === "burndown" && burndownQuery.data && <BurndownChart data={burndownQuery.data} />}
    </div>
  );
}
