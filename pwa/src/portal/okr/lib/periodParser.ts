export interface PeriodRange {
  start: string;
  end: string;
}

const QUARTER = /^(\d{4})-Q([1-4])$/;
const HALF = /^(\d{4})-H([12])$/;
const YEAR = /^(\d{4})$/;

const Q_BOUNDS: Record<string, [string, string]> = {
  "1": ["01-01", "03-31"],
  "2": ["04-01", "06-30"],
  "3": ["07-01", "09-30"],
  "4": ["10-01", "12-31"],
};
const H_BOUNDS: Record<string, [string, string]> = {
  "1": ["01-01", "06-30"],
  "2": ["07-01", "12-31"],
};

export function parsePeriod(value: string | null | undefined): PeriodRange | null {
  if (!value) return null;
  const q = QUARTER.exec(value);
  if (q) {
    const [s, e] = Q_BOUNDS[q[2]];
    return { start: `${q[1]}-${s}`, end: `${q[1]}-${e}` };
  }
  const h = HALF.exec(value);
  if (h) {
    const [s, e] = H_BOUNDS[h[2]];
    return { start: `${h[1]}-${s}`, end: `${h[1]}-${e}` };
  }
  const y = YEAR.exec(value);
  if (y) return { start: `${y[1]}-01-01`, end: `${y[1]}-12-31` };
  return null;
}
