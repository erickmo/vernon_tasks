import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createSprint, updateSprint } from "./api/sprints";
import type { SprintStatus } from "./api/types";
import * as telemetry from "../../telemetry";

interface Props {
  mode: "create" | "edit";
  projectId: string;
  sprintId?: string;
  initial?: { sprint_title: string; start_date: string; end_date: string; status: SprintStatus; goal: string };
  onClose: () => void;
  onSaved: (name: string) => void;
}

export function SprintEditor({ mode, projectId, sprintId, initial, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(initial?.sprint_title ?? "");
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [endDate, setEndDate] = useState(initial?.end_date ?? "");
  const [status, setStatus] = useState<SprintStatus>(initial?.status ?? "Planning");
  const [goal, setGoal] = useState(initial?.goal ?? "");

  const save = useMutation({
    mutationFn: async () => {
      if (mode === "create") {
        const r = await createSprint({ sprint_title: title, project: projectId,
          start_date: startDate, end_date: endDate, status, goal });
        telemetry.trackSprintCreated(r.name, projectId);
        return r.name;
      }
      const r = await updateSprint(sprintId!, { sprint_title: title,
        start_date: startDate, end_date: endDate, status, goal });
      telemetry.trackSprintUpdated(r.name, ["sprint_title", "start_date", "end_date", "status", "goal"]);
      return r.name;
    },
    onSuccess: (name) => { onSaved(name); onClose(); },
  });

  return (
    <div className="modal" role="dialog">
      <h3>{mode === "create" ? "New sprint" : "Edit sprint"}</h3>
      <label>Sprint title <input value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label>Start date <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
      <label>End date <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
      <label>Status
        <select value={status} onChange={e => setStatus(e.target.value as SprintStatus)}>
          <option>Planning</option><option>Active</option><option>Review</option><option>Closed</option>
        </select>
      </label>
      <label>Goal <textarea value={goal} onChange={e => setGoal(e.target.value)} /></label>
      <button onClick={onClose}>Cancel</button>
      <button onClick={() => save.mutate()} disabled={save.isPending}>Save</button>
      {save.isError && <div role="alert">{String(save.error)}</div>}
    </div>
  );
}
