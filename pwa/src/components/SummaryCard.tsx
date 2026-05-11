interface Props {
  icon?: string;
  label: string;
  value: string | number;
  accent?: string;
}

export function SummaryCard({ icon, label, value, accent }: Props) {
  return (
    <div
      style={{
        padding: "var(--vt-space-4)",
        background: "var(--vt-surface)",
        borderRadius: "var(--vt-radius)",
        borderTop: accent ? `3px solid ${accent}` : undefined,
        boxShadow: "var(--vt-shadow)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      <span style={{ fontSize: 24, fontWeight: 700 }}>{value}</span>
      <span style={{ fontSize: 12, color: "var(--vt-text-muted)" }}>{label}</span>
    </div>
  );
}
