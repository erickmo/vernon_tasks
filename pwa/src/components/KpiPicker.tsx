import { KpiMeta } from "../api/leaderExec";

interface Props {
  kpis: KpiMeta[];
  value: string;
  onChange: (kpi: string) => void;
  loading?: boolean;
}

export function KpiPicker({ kpis, value, onChange, loading }: Props) {
  if (loading) {
    return (
      <div style={{ height: 40, background: "var(--vt-surface)", borderRadius: "var(--vt-radius)" }} />
    );
  }
  if (kpis.length === 0) {
    return (
      <div style={{ color: "var(--vt-text-muted)", padding: 8, fontSize: 13 }}>
        Belum ada KPI terdefinisi
      </div>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: 10,
        borderRadius: "var(--vt-radius)",
        border: "1px solid var(--vt-border)",
        background: "var(--vt-surface)",
        color: "var(--vt-text)",
        marginBottom: "var(--vt-space-3)",
      }}
    >
      {kpis.map((k) => (
        <option key={k.name} value={k.name}>
          {k.kpi_name} ({k.unit})
        </option>
      ))}
    </select>
  );
}
