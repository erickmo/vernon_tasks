import { ageMs, isStale } from "../cache/sync-time";
import { fmtRelative } from "../i18n";

export function StaleBadge({ resource }: { resource: string }) {
  const age = ageMs(resource);
  if (!Number.isFinite(age)) return null;
  const stale = isStale(resource);
  return (
    <span style={{ fontSize: 12, color: stale ? "var(--vt-warn)" : "var(--vt-text-muted)" }}>
      Diperbarui {fmtRelative(age)}
    </span>
  );
}
