import { ReactNode, useRef, useState } from "react";

interface Props {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, children }: Props) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  function onTouchStart(e: React.TouchEvent) {
    if (window.scrollY <= 0) startY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setPull(Math.min(dy, 80));
  }
  async function onTouchEnd() {
    if (pull > 60 && !busy) {
      setBusy(true);
      try {
        await onRefresh();
      } finally {
        setBusy(false);
      }
    }
    setPull(0);
    startY.current = null;
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ flex: 1, display: "flex", flexDirection: "column" }}
    >
      <div
        style={{
          height: pull,
          textAlign: "center",
          color: "var(--vt-text-muted)",
          overflow: "hidden",
          transition: busy ? "none" : "height 0.2s",
        }}
      >
        {busy ? "Menyegarkan…" : pull > 60 ? "Lepas untuk segarkan" : "Tarik untuk segarkan"}
      </div>
      {children}
    </div>
  );
}
