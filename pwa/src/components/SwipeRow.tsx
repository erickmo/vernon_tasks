import { ReactNode, useRef, useState, PointerEvent } from "react";

const THRESHOLD_PX = 80;

interface Props {
  children: ReactNode;
  actions: ReactNode;
  actionsWidth?: number;
}

export function SwipeRow({ children, actions, actionsWidth = 200 }: Props) {
  const startX = useRef<number | null>(null);
  const [dx, setDx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  function onPointerDown(e: PointerEvent) {
    startX.current = e.clientX;
  }

  function onPointerMove(e: PointerEvent) {
    if (startX.current == null) return;
    const delta = e.clientX - startX.current;
    if (delta < 0) setDx(Math.max(delta, -actionsWidth));
  }

  function onPointerUp() {
    if (startX.current == null) return;
    const willReveal = Math.abs(dx) >= THRESHOLD_PX;
    setRevealed(willReveal);
    setDx(willReveal ? -actionsWidth : 0);
    startX.current = null;
  }

  return (
    <div
      style={{ position: "relative", overflow: "hidden", touchAction: "pan-y" }}
      data-revealed={revealed ? "true" : "false"}
    >
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: actionsWidth,
          display: "flex",
          alignItems: "stretch",
        }}
      >
        {actions}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translateX(${dx}px)`,
          transition: startX.current ? "none" : "transform 0.2s",
          background: "var(--vt-bg)",
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}
