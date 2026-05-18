import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as krApi from "./api/keyResults";
import { okrKeys } from "./hooks/keys";
import * as telemetry from "../../telemetry";
import type { KeyResult } from "./api/types";

export interface KRRowProps {
  kr: KeyResult;
  objectiveName: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";
const DEBOUNCE_MS = 800;

export function KRRow({ kr, objectiveName }: KRRowProps) {
  const qc = useQueryClient();
  const [value, setValue] = useState(String(kr.current_value));
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setValue(String(kr.current_value));
  }, [kr.current_value]);

  function scheduleSave(nextValue: number) {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setState("saving");
      try {
        await krApi.updateKeyResult(kr.name, {
          current_value: nextValue,
          _modified: kr.modified,
        });
        telemetry.trackOkrKrUpdate(kr.name, nextValue - kr.current_value);
        setState("saved");
        qc.invalidateQueries({ queryKey: okrKeys.detail(objectiveName) });
        qc.invalidateQueries({ queryKey: okrKeys.lists() });
      } catch {
        setState("error");
      }
    }, DEBOUNCE_MS);
  }

  return (
    <div className="kr-row">
      <span className="kr-row__metric">{kr.metric}</span>
      <input
        type="number"
        className="kr-row__current"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          const num = Number(e.target.value);
          if (!Number.isNaN(num)) scheduleSave(num);
        }}
      />
      <span className="kr-row__target">
        / {kr.target_value}
        {kr.unit ? ` ${kr.unit}` : ""}
      </span>
      <progress max={100} value={Math.round(kr.progress_percent)} />
      <span className="kr-row__state" data-state={state}>
        {state === "saving" && "…"}
        {state === "saved" && "✓"}
        {state === "error" && "!"}
      </span>
    </div>
  );
}
