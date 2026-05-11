interface Props {
  pct: number;
  height?: number;
  label?: string;
}

export function ProgressBar({ pct, height = 8, label }: Props) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div
        style={{
          height,
          background: "var(--vt-border)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${clamped}%`,
            background: "var(--vt-primary)",
            transition: "width 0.3s",
          }}
        />
      </div>
      {label !== undefined && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 4,
            fontSize: 12,
            color: "var(--vt-text-muted)",
          }}
        >
          <span>{label}</span>
          <span>{clamped}%</span>
        </div>
      )}
    </div>
  );
}
