export const PDCA_SEQUENCE = ["PLAN", "DO", "CHECK", "ACT", "CLOSED"] as const;
export type PdcaPhase = (typeof PDCA_SEQUENCE)[number];

export function nextPdca(current: string): PdcaPhase | null {
  const idx = (PDCA_SEQUENCE as readonly string[]).indexOf(current);
  if (idx === -1 || idx + 1 >= PDCA_SEQUENCE.length) return null;
  return PDCA_SEQUENCE[idx + 1];
}
