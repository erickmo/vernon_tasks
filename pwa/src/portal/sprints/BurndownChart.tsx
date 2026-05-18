import type { BurndownSeries } from "./api/types";

const W = 480, H = 240, PAD = 24;

export function BurndownChart({ data }: { data: BurndownSeries }) {
  const max = data.total_hours || 1;
  const n = data.series.length;
  const x = (i: number) => PAD + (i / Math.max(n - 1, 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);

  const path = (pts: number[]) =>
    pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  return (
    <svg width={W} height={H} role="img" aria-label="Burndown chart">
      <path d={path(data.series.map(p => p.ideal))} stroke="#888" fill="none" strokeDasharray="4 4" />
      <path d={path(data.series.map(p => p.remaining))} stroke="#1d70b8" fill="none" strokeWidth={2} />
    </svg>
  );
}
