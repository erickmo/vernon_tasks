import type { MeWorkload } from "../../../../api/dashboard";
import { TOKENS } from "./shared";

interface Props {
  workload: MeWorkload;
}

interface Chip {
  key: keyof MeWorkload;
  label: string;
  activeColor: string;
  activeBg: string;
}

const CHIPS: Chip[] = [
  { key: "open",     label: "Open",      activeColor: TOKENS.INDIGO, activeBg: "#eef2ff" },
  { key: "overdue",  label: "Overdue",   activeColor: TOKENS.RED,    activeBg: "#fef2f2" },
  { key: "due_soon", label: "Due ≤ 3d",  activeColor: TOKENS.AMBER,  activeBg: "#fffbeb" },
];

export function WorkloadChips({ workload }: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {CHIPS.map((c) => {
        const value = workload[c.key];
        const active = value > 0;
        return (
          <div
            key={c.key}
            style={{
              background: active ? c.activeBg : TOKENS.CARD,
              borderRadius: 10,
              padding: "10px 12px",
              boxShadow: TOKENS.SHADOW,
              border: active ? `1px solid ${c.activeColor}33` : `1px solid ${TOKENS.BD}`,
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: active ? c.activeColor : TOKENS.TEXT3,
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
            >
              {value}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: active ? c.activeColor : TOKENS.TEXT3,
                marginTop: 5,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {c.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
