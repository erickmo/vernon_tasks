import { useState } from "react";
import { usePdcaTransition } from "./hooks/usePdcaTransition";

export interface BulkActionsProps {
  selected: Set<string>;
}

export function BulkActions({ selected }: BulkActionsProps) {
  const [open, setOpen] = useState(false);
  const mut = usePdcaTransition();

  if (selected.size === 0) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={mut.isPending}>
        Advance PDCA → ({selected.size})
      </button>
      {open && (
        <div role="dialog" aria-labelledby="bulk-confirm">
          <h2 id="bulk-confirm">Advance PDCA for {selected.size} objective(s)?</h2>
          <p>
            This moves each selected objective to the next PDCA phase. CLOSED
            objectives are skipped.
          </p>
          <button
            type="button"
            onClick={async () => {
              await mut.mutateAsync(Array.from(selected));
              setOpen(false);
            }}
          >
            Confirm
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
