export const RANK_STEP = 1000;
export const RANK_COLLISION_FLOOR = 0.0001;

export function computeRank(prev: number | null, next: number | null): number {
  if (prev == null && next == null) return RANK_STEP;
  if (prev == null && next != null) return next - RANK_STEP;
  if (prev != null && next == null) return prev + RANK_STEP;
  return ((prev as number) + (next as number)) / 2;
}

export function needsRebalance(a: number, b: number): boolean {
  return Math.abs(b - a) < RANK_COLLISION_FLOOR;
}
