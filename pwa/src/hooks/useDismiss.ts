// pwa/src/hooks/useDismiss.ts
import { useEffect, type RefObject } from "react";

/**
 * Calls `onDismiss` on Escape key or pointerdown outside `ref`, while `active`.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active = true,
): void {
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    function onPointer(e: PointerEvent) {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onDismiss();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [ref, onDismiss, active]);
}
