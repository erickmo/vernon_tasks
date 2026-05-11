export const STALE_THRESHOLD_MS = 60 * 60 * 1000;
const PREFIX = "vt_sync:";

export function stamp(key: string): void {
  localStorage.setItem(PREFIX + key, String(Date.now()));
}

export function lastSync(key: string): number | null {
  const v = localStorage.getItem(PREFIX + key);
  return v ? Number(v) : null;
}

export function ageMs(key: string): number {
  const ts = lastSync(key);
  return ts ? Date.now() - ts : Number.POSITIVE_INFINITY;
}

export function isStale(key: string): boolean {
  return ageMs(key) > STALE_THRESHOLD_MS;
}
