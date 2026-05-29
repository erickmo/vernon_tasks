// pwa/src/hooks/useDismiss.ts
import { useEffect, useRef, type RefObject } from "react";

/**
 * Calls `onDismiss` on Escape key or pointerdown outside `ref`, while `active`.
 * The handler ref is stabilized so re-renders with inline callbacks don't
 * detach/reattach listeners.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active = true,
): void {
  const cb = useRef(onDismiss);

  // Keep cb current every render without triggering the listener effect.
  useEffect(() => {
    cb.current = onDismiss;
  });

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cb.current();
    }
    function onPointer(e: PointerEvent) {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) cb.current();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [ref, active]);
}
