import type { RiskLevel } from "../../../../api/dashboard";

export const TOKENS = {
  BG: "#f1f5f9",
  CARD: "#ffffff",
  SHADOW: "0 1px 3px rgba(0,0,0,0.07), 0 2px 10px rgba(0,0,0,0.04)",
  BD: "#e8edf3",
  TEXT: "#0f172a",
  TEXT2: "#64748b",
  TEXT3: "#94a3b8",
  INDIGO: "#4f46e5",
  PURPLE: "#7c3aed",
  GREEN: "#059669",
  AMBER: "#d97706",
  RED: "#dc2626",
} as const;

export const RISK_META: Record<RiskLevel, { label: string; bg: string; color: string }> = {
  on_track: { label: "On track", bg: "#f0fdf4", color: TOKENS.GREEN },
  at_risk:  { label: "At risk",  bg: "#fffbeb", color: TOKENS.AMBER },
  behind:   { label: "Behind",   bg: "#fef2f2", color: TOKENS.RED },
};

export function priorityColor(p: string | null | undefined): string {
  if (p === "High") return TOKENS.RED;
  if (p === "Low") return TOKENS.TEXT3;
  return TOKENS.AMBER;
}

export function fmtDateShort(d: string | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  } catch {
    return d;
  }
}
