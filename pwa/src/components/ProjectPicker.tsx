interface Props {
  projects: string[];
  value: string;
  onChange: (project: string) => void;
  loading?: boolean;
}

export function ProjectPicker({ projects, value, onChange, loading }: Props) {
  if (loading) {
    return (
      <div style={{ height: 40, background: "var(--vt-surface)", borderRadius: "var(--vt-radius)" }} />
    );
  }
  if (projects.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--vt-text-muted)" }}>
        Mulai kerjakan tugas untuk melihat analitik
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
      {projects.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  );
}
