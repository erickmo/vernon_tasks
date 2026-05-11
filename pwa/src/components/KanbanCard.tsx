import { Link } from "react-router-dom";
import { KanbanItem } from "../api/dashboard";
import { fmtDate } from "../i18n";

export function KanbanCard({ item }: { item: KanbanItem }) {
  return (
    <Link
      to={`/m/work/${encodeURIComponent(item.id)}`}
      style={{
        display: "block",
        padding: "var(--vt-space-3)",
        background: "var(--vt-bg)",
        borderRadius: "var(--vt-radius-sm)",
        border: "1px solid var(--vt-border)",
        color: "var(--vt-text)",
        textDecoration: "none",
        marginBottom: 8,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: "var(--vt-text-muted)" }}>
        <span>{item.deadline ? fmtDate(item.deadline) : "—"}</span>
        {item.points ? <span>+{item.points} pts</span> : null}
      </div>
    </Link>
  );
}
