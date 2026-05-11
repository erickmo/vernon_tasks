export function Skeleton({
  height = 16,
  width = "100%",
  radius = 8,
}: {
  height?: number;
  width?: number | string;
  radius?: number;
}) {
  return (
    <div
      aria-hidden
      style={{
        height,
        width,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, var(--vt-surface), var(--vt-border), var(--vt-surface))",
        backgroundSize: "200% 100%",
        animation: "vt-shimmer 1.4s infinite",
      }}
    />
  );
}
