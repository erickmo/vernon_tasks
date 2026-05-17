import { useState } from "react";
import { useProjectsBulk } from "./hooks/useProjectsBulk";
import { PROJECT_STATUSES, type ProjectStatus } from "./lib/projectStatus";
import * as telemetry from "../../telemetry";

export interface BulkActionsProps { selected: Set<string> }

type Mode = "pdca" | "status" | null;

export function BulkActions({ selected }: BulkActionsProps) {
  const [mode, setMode] = useState<Mode>(null);
  const [target, setTarget] = useState<ProjectStatus | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const mut = useProjectsBulk();

  if (selected.size === 0) return null;

  async function confirm() {
    const names = Array.from(selected);
    if (mode === "pdca") {
      const res = await mut.mutateAsync({ names, payload: { pdca_phase: "__next__" } });
      telemetry.trackProjectsBulkPdca(
        res.updated.length,
        res.updated.map((u) => [
          String(u.changes.pdca_phase ?? ""),
          String(u.changes.pdca_phase ?? ""),
        ]),
      );
    } else if (mode === "status" && target) {
      const res = await mut.mutateAsync({ names, payload: { status: target } });
      telemetry.trackProjectsBulkStatusSet(res.updated.length, target);
    }
    setMode(null);
    setTarget(null);
  }

  return (
    <>
      <button type="button" disabled={mut.isPending} onClick={() => setMode("pdca")}>
        Advance PDCA → ({selected.size})
      </button>
      <button type="button" disabled={mut.isPending} onClick={() => setShowStatusMenu((v) => !v)}>
        Set Status…
      </button>
      {showStatusMenu && (
        <div role="menu" className="projects-bulk__menu">
          {PROJECT_STATUSES.map((s) => (
            <button key={s} type="button" role="menuitem"
              onClick={() => { setTarget(s); setMode("status"); setShowStatusMenu(false); }}>
              {s}
            </button>
          ))}
        </div>
      )}
      {mode && (
        <div role="dialog" aria-labelledby="proj-bulk-confirm">
          <h2 id="proj-bulk-confirm">
            {mode === "pdca"
              ? `Advance PDCA for ${selected.size} project(s)?`
              : `Set status to "${target}" for ${selected.size} project(s)?`}
          </h2>
          <p>
            {mode === "pdca"
              ? "Moves each selected project to the next PDCA phase. Closed projects are skipped."
              : "Applies the target status to each selected project."}
          </p>
          <button type="button" onClick={confirm}>Confirm</button>
          <button type="button" onClick={() => { setMode(null); setTarget(null); }}>Cancel</button>
        </div>
      )}
    </>
  );
}
