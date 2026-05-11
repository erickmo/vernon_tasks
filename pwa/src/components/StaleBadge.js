import { jsxs as _jsxs } from "react/jsx-runtime";
import { ageMs, isStale } from "../cache/sync-time";
import { fmtRelative } from "../i18n";
export function StaleBadge({ resource }) {
    const age = ageMs(resource);
    if (!Number.isFinite(age))
        return null;
    const stale = isStale(resource);
    return (_jsxs("span", { style: { fontSize: 12, color: stale ? "var(--vt-warn)" : "var(--vt-text-muted)" }, children: ["Diperbarui ", fmtRelative(age)] }));
}
