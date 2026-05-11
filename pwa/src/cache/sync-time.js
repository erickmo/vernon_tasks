export const STALE_THRESHOLD_MS = 60 * 60 * 1000;
const PREFIX = "vt_sync:";
export function stamp(key) {
    localStorage.setItem(PREFIX + key, String(Date.now()));
}
export function lastSync(key) {
    const v = localStorage.getItem(PREFIX + key);
    return v ? Number(v) : null;
}
export function ageMs(key) {
    const ts = lastSync(key);
    return ts ? Date.now() - ts : Number.POSITIVE_INFINITY;
}
export function isStale(key) {
    return ageMs(key) > STALE_THRESHOLD_MS;
}
