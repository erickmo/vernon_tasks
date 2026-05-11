import { SearchFilters } from "../api/search";
import { t, StringKey } from "../i18n";

interface Props {
  filters: SearchFilters;
  onRemove: (key: keyof SearchFilters, value?: string) => void;
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 999,
        background: "var(--vt-surface)",
        border: "1px solid var(--vt-border)",
        fontSize: 12,
      }}
    >
      {label}
      <button
        onClick={onRemove}
        aria-label={`remove ${label}`}
        style={{
          background: "transparent",
          border: 0,
          color: "var(--vt-text-muted)",
          padding: 0,
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </span>
  );
}

export function ActiveFilterChips({ filters, onRemove }: Props) {
  const chips: Array<{ label: string; onRemove: () => void }> = [];

  filters.priority?.forEach((p) =>
    chips.push({ label: p, onRemove: () => onRemove("priority", p) }),
  );
  if (filters.project)
    chips.push({ label: filters.project, onRemove: () => onRemove("project") });
  if (filters.due_range && filters.due_range !== "all") {
    chips.push({
      label: t(`filter.due.${filters.due_range}` as StringKey),
      onRemove: () => onRemove("due_range"),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "var(--vt-space-3)" }}>
      {chips.map((c, i) => (
        <Chip key={i} {...c} />
      ))}
    </div>
  );
}
