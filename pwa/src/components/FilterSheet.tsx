import { useState } from "react";
import { DueRange, SearchFilters } from "../api/search";
import { t, StringKey } from "../i18n";

interface Props {
  open: boolean;
  initial: SearchFilters;
  onApply: (f: SearchFilters) => void;
  onCancel: () => void;
}

const PRIORITIES = ["Tinggi", "Sedang", "Rendah"] as const;
const DUE_RANGES: { value: DueRange; key: "today" | "week" | "overdue" | "all" }[] = [
  { value: "all", key: "all" },
  { value: "today", key: "today" },
  { value: "week", key: "week" },
  { value: "overdue", key: "overdue" },
];

export function FilterSheet({ open, initial, onApply, onCancel }: Props) {
  const [priority, setPriority] = useState<string[]>(initial.priority ?? []);
  const [project, setProject] = useState<string>(initial.project ?? "");
  const [dueRange, setDueRange] = useState<DueRange>(initial.due_range ?? "all");

  if (!open) return null;

  function togglePriority(p: string) {
    setPriority((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function reset() {
    setPriority([]);
    setProject("");
    setDueRange("all");
  }

  function apply() {
    onApply({ priority, project: project || undefined, due_range: dueRange });
  }

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "end center",
        zIndex: 100,
        paddingBottom: "calc(var(--bottom-nav-h) + var(--safe-bottom))",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--vt-bg)",
          color: "var(--vt-text)",
          width: "100%",
          maxWidth: 480,
          padding: 24,
          borderRadius: "16px 16px 0 0",
        }}
      >
        <h3 style={{ marginTop: 0 }}>{t("filter.title")}</h3>

        <section style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: "var(--vt-text-muted)", marginBottom: 8 }}>
            {t("filter.priority")}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PRIORITIES.map((p) => {
              const active = priority.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePriority(p)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--vt-border)",
                    background: active ? "var(--vt-primary)" : "transparent",
                    color: active ? "var(--vt-primary-contrast)" : "var(--vt-text)",
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </section>

        <section style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: "var(--vt-text-muted)", marginBottom: 8 }}>
            {t("filter.project")}
          </div>
          <input
            type="text"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder={t("filter.all_projects")}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--vt-border)" }}
          />
        </section>

        <section style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: "var(--vt-text-muted)", marginBottom: 8 }}>
            {t("filter.due_range")}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DUE_RANGES.map((r) => {
              const active = dueRange === r.value;
              return (
                <button
                  key={r.value}
                  onClick={() => setDueRange(r.value)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--vt-border)",
                    background: active ? "var(--vt-primary)" : "transparent",
                    color: active ? "var(--vt-primary-contrast)" : "var(--vt-text)",
                  }}
                >
                  {t(`filter.due.${r.key}` as StringKey)}
                </button>
              );
            })}
          </div>
        </section>

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <button onClick={reset}>{t("filter.reset")}</button>
          <button
            onClick={apply}
            style={{
              padding: "10px 20px",
              background: "var(--vt-primary)",
              color: "var(--vt-primary-contrast)",
              border: 0,
              borderRadius: "var(--vt-radius)",
              fontWeight: 600,
            }}
          >
            {t("filter.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
