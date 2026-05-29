// pwa/src/components/ui/Badge.tsx
interface Props {
  variant: "dot" | "count";
  count?: number;
  max?: number;
  tone?: "danger" | "primary";
  ring?: boolean;
  ariaLabel?: string;
}

export function Badge({ variant, count = 0, max = 99, tone = "danger", ring, ariaLabel }: Props) {
  const bg = tone === "primary" ? "var(--vt-primary)" : "var(--vt-danger)";
  if (variant === "dot") {
    return (
      <span
        aria-label={ariaLabel}
        style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: bg }}
      />
    );
  }
  if (!count) return null;
  const label = count > max ? `${max}+` : String(count);
  return (
    <span
      aria-label={ariaLabel ?? `${count} unread`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 16, height: 16, padding: "0 4px", borderRadius: 99,
        background: bg, color: "#fff", fontSize: 9, fontWeight: 700,
        letterSpacing: "-0.02em",
        boxShadow: ring ? "0 0 0 2px var(--vt-nav-bg-solid, #6836a0)" : undefined,
      }}
    >
      {label}
    </span>
  );
}
