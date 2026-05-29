// pwa/src/components/ui/Modal.tsx
import { useEffect, useRef, type ReactNode } from "react";

type Variant = "center" | "sheet" | "slide";

interface Props {
  open: boolean;
  onClose: () => void;
  variant: Variant;
  labelledBy?: string;
  busy?: boolean;
  zIndex?: number;
  children: ReactNode;
}

const Z_DEFAULT: Record<Variant, number> = { center: 60, sheet: 100, slide: 50 };
const OVERLAY_BG: Record<Variant, string> = {
  center: "rgba(0,0,0,0.3)",
  sheet: "rgba(0,0,0,0.5)",
  slide: "rgba(0,0,0,0.3)",
};

function containerStyle(variant: Variant, z: number): React.CSSProperties {
  const base: React.CSSProperties = { position: "fixed", zIndex: z + 1, background: "#fff" };
  if (variant === "center") {
    return { ...base, top: "50%", left: "50%", transform: "translate(-50%,-50%)",
      borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.16)", maxWidth: "90vw" };
  }
  if (variant === "sheet") {
    return { ...base, left: 0, right: 0, bottom: 0, margin: "0 auto", maxWidth: 480,
      borderRadius: "16px 16px 0 0", paddingBottom: "var(--safe-bottom)" };
  }
  return { ...base, top: 0, right: 0, bottom: 0, width: 360, maxWidth: "100vw",
    boxShadow: "-4px 0 24px rgba(0,0,0,0.12)" };
}

export function Modal({ open, onClose, variant, labelledBy, busy, zIndex, children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const z = zIndex ?? Z_DEFAULT[variant];

  // Keep onCloseRef current every render so keydown handler never goes stale.
  onCloseRef.current = onClose;

  // Effect A: save/restore focus only — deps [open].
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const el = dialogRef.current;
    const focusable = el?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? el)?.focus();
    return () => {
      prevFocus.current?.focus?.();
    };
  }, [open]);

  // Effect B: keydown handler (Escape + tab-trap) — deps [open].
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      const el = dialogRef.current;
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(n => !n.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      } else if (document.activeElement === el) {
        // Container itself holds focus — move to first focusable element.
        e.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;
  return (
    <>
      <div
        data-testid="modal-backdrop"
        onClick={() => { if (!busy) onCloseRef.current(); }}
        style={{ position: "fixed", inset: 0, background: OVERLAY_BG[variant], zIndex: z }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={containerStyle(variant, z)}
      >
        {children}
      </div>
    </>
  );
}
