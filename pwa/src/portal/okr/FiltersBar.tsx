import { useSearchParams } from "react-router-dom";

const STATUS_OPTIONS = ["Open", "On Track", "At Risk", "Closed"];
const PDCA_OPTIONS = ["PLAN", "DO", "CHECK", "ACT", "CLOSED"];

function toggleInList(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function FiltersBar() {
  const [params, setParams] = useSearchParams();
  const statuses = params.getAll("statuses");
  const pdcaPhases = params.getAll("pdca");

  function update(next: URLSearchParams) {
    setParams(next, { replace: true });
  }

  return (
    <div className="okr-filters" role="region" aria-label="OKR filters">
      <label>
        Period start
        <input
          type="date"
          value={params.get("period_start") ?? ""}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set("period_start", e.target.value);
            else next.delete("period_start");
            update(next);
          }}
        />
      </label>
      <label>
        Period end
        <input
          type="date"
          value={params.get("period_end") ?? ""}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set("period_end", e.target.value);
            else next.delete("period_end");
            update(next);
          }}
        />
      </label>

      <div className="okr-filters__chips" role="group" aria-label="Status">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={statuses.includes(s)}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete("statuses");
              for (const v of toggleInList(statuses, s)) next.append("statuses", v);
              update(next);
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="okr-filters__chips" role="group" aria-label="PDCA">
        {PDCA_OPTIONS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={pdcaPhases.includes(p)}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete("pdca");
              for (const v of toggleInList(pdcaPhases, p)) next.append("pdca", v);
              update(next);
            }}
          >
            {p}
          </button>
        ))}
      </div>

      <button type="button" onClick={() => update(new URLSearchParams())}>
        Clear filters
      </button>
    </div>
  );
}
