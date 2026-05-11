import { KanbanItem } from "../api/dashboard";
import { KanbanCard } from "./KanbanCard";

interface Props {
  title: string;
  items: KanbanItem[];
  accent?: string;
}

export function KanbanColumn({ title, items, accent }: Props) {
  return (
    <div
      style={{
        minWidth: 220,
        background: "var(--vt-surface)",
        borderRadius: "var(--vt-radius)",
        padding: "var(--vt-space-3)",
        borderTop: accent ? `3px solid ${accent}` : undefined,
        flex: "0 0 auto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <span>{title}</span>
        <span style={{ color: "var(--vt-text-muted)" }}>{items.length}</span>
      </div>
      {items.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--vt-text-muted)", textAlign: "center", padding: 8 }}>
          —
        </div>
      )}
      {items.map((it) => (
        <KanbanCard key={it.id} item={it} />
      ))}
    </div>
  );
}
