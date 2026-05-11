interface Props {
  title: string;
  body?: string;
  cta?: { label: string; onClick: () => void };
}

export function EmptyState({ title, body, cta }: Props) {
  return (
    <div style={{ padding: "var(--vt-space-6)", textAlign: "center", color: "var(--vt-text-muted)" }}>
      <h3 style={{ color: "var(--vt-text)" }}>{title}</h3>
      {body && <p>{body}</p>}
      {cta && (
        <button
          onClick={cta.onClick}
          style={{
            padding: "var(--vt-space-3) var(--vt-space-4)",
            background: "var(--vt-primary)",
            color: "var(--vt-primary-contrast)",
            border: 0,
            borderRadius: "var(--vt-radius)",
          }}
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
