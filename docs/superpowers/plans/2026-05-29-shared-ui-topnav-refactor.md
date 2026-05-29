# Shared Badge/Modal + TopNav Decompose — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract shared `Badge` and `Modal` primitives plus a `useDismiss` hook, migrate the 5 badge sites and 10 modal/overlay sites onto them (adding a11y), and decompose the 629-line `TopNav.tsx` — with zero end-user behavior change.

**Architecture:** Three new primitives in `pwa/src` — `hooks/useDismiss.ts` (esc + outside-click + focus-trap), `components/ui/Badge.tsx`, `components/ui/Modal.tsx` (variants center/sheet/slide). Existing modal bodies stay; only the overlay/container/a11y shell moves into `Modal`. `NotificationBell` stays a popover (uses `useDismiss`, not `Modal`). `TopNav.tsx` splits into a `components/TopNav/` folder.

**Tech Stack:** React + Vite, TypeScript, @tanstack/react-query, Vitest + @testing-library/react. Test runner: `cd pwa && pnpm vitest run <path>`.

**Conventions (verified):**
- Theme tokens in `pwa/src/theme/tokens.css`: `--vt-danger:#dc2626`, `--vt-primary:#7c4dab`, `--safe-bottom`, `--vt-radius`, `--vt-space-*`.
- Test mock pattern: `vi.mock` hook/api modules; wrap router-dependent components in `<MemoryRouter>`; query-dependent in `<QueryClientProvider>`.
- Run all git commands from repo root `/Users/erickmo/Desktop/Project/frappe/apps/vernon_tasks`; run pnpm from `pwa/`.

**Migration recipe (applies to every modal task):** Do NOT change the modal's form fields, handlers, copy, sizes, colors, or z-index. ONLY replace the hand-rolled overlay `<div>` + container `<div>` (and any manual esc/outside-click `useEffect`) with `<Modal variant=... open onClose busy=... labelledBy=...>`, moving the inner content as `children`. After each migration the modal's EXISTING test must stay green; if a test asserted on the old overlay structure, adapt the assertion to the new structure while preserving intent.

---

### Task 1: `useDismiss` hook

**Files:**
- Create: `pwa/src/hooks/useDismiss.ts`
- Test: `pwa/src/hooks/useDismiss.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// pwa/src/hooks/useDismiss.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { useDismiss } from "./useDismiss";

function Harness({ onDismiss }: { onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onDismiss, true);
  return (
    <div>
      <div ref={ref} data-testid="inside">inside</div>
      <button data-testid="outside">outside</button>
    </div>
  );
}

describe("useDismiss", () => {
  it("calls handler on Escape", () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls handler on outside pointerdown", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
    fireEvent.pointerDown(getByTestId("outside"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does NOT call handler on inside pointerdown", () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);
    fireEvent.pointerDown(getByTestId("inside"));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does nothing when inactive", () => {
    const onDismiss = vi.fn();
    function Inactive() {
      const ref = useRef<HTMLDivElement>(null);
      useDismiss(ref, onDismiss, false);
      return <div ref={ref} />;
    }
    render(<Inactive />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/hooks/useDismiss.test.tsx`
Expected: FAIL — `Failed to resolve import "./useDismiss"`.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/hooks/useDismiss.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add pwa/src/hooks/useDismiss.ts pwa/src/hooks/useDismiss.test.tsx
git commit -m "feat(pwa): useDismiss hook (esc + outside-click)"
```

---

### Task 2: `Badge` component

**Files:**
- Create: `pwa/src/components/ui/Badge.tsx`
- Test: `pwa/src/components/ui/Badge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// pwa/src/components/ui/Badge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders dot variant with no text", () => {
    render(<Badge variant="dot" ariaLabel="unread" />);
    const el = screen.getByLabelText("unread");
    expect(el).toBeInTheDocument();
    expect(el.textContent).toBe("");
  });

  it("renders count", () => {
    render(<Badge variant="count" count={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("caps count at max with plus", () => {
    render(<Badge variant="count" count={150} max={99} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("returns null for count variant when count is 0", () => {
    const { container } = render(<Badge variant="count" count={0} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/components/ui/Badge.test.tsx`
Expected: FAIL — import unresolved.

- [ ] **Step 3: Implement**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/components/ui/Badge.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add pwa/src/components/ui/Badge.tsx pwa/src/components/ui/Badge.test.tsx
git commit -m "feat(pwa): shared Badge component (dot + count variants)"
```

---

### Task 3: `Modal` component

**Files:**
- Create: `pwa/src/components/ui/Modal.tsx`
- Test: `pwa/src/components/ui/Modal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// pwa/src/components/ui/Modal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("does not render children when closed", () => {
    render(<Modal open={false} onClose={vi.fn()} variant="center"><p>hi</p></Modal>);
    expect(screen.queryByText("hi")).not.toBeInTheDocument();
  });

  it("renders dialog with role and aria-modal when open", () => {
    render(<Modal open onClose={vi.fn()} variant="center"><p>hi</p></Modal>);
    const dlg = screen.getByRole("dialog");
    expect(dlg).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} variant="center"><p>hi</p></Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on backdrop click", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} variant="center"><p>hi</p></Modal>);
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("ignores backdrop click when busy", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} variant="center" busy><p>hi</p></Modal>);
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves focus into the dialog on open", () => {
    render(<Modal open onClose={vi.fn()} variant="center"><button>act</button></Modal>);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/components/ui/Modal.test.tsx`
Expected: FAIL — import unresolved.

- [ ] **Step 3: Implement**

```tsx
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
  const z = zIndex ?? Z_DEFAULT[variant];

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const el = dialogRef.current;
    const focusable = el?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? el)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(n => !n.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prevFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div
        data-testid="modal-backdrop"
        onClick={() => { if (!busy) onClose(); }}
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/components/ui/Modal.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add pwa/src/components/ui/Modal.tsx pwa/src/components/ui/Modal.test.tsx
git commit -m "feat(pwa): shared Modal wrapper (center/sheet/slide + a11y + focus trap)"
```

---

### Task 4: Add `--vt-nav-*` tokens

**Files:**
- Modify: `pwa/src/theme/tokens.css`

- [ ] **Step 1: Add tokens**

In `tokens.css`, inside the `:root` block (next to the existing `--vt-primary*` lines), add:

```css
  --vt-nav-bg: linear-gradient(135deg, #6836a0 0%, #7c4dab 100%);
  --vt-nav-bg-solid: #6836a0;
  --vt-nav-text: #ffffff;
  --vt-nav-muted: rgba(255, 255, 255, 0.6);
  --vt-nav-border: rgba(255, 255, 255, 0.14);
  --vt-nav-active: rgba(255, 255, 255, 0.18);
```

- [ ] **Step 2: Verify build still parses**

Run: `cd pwa && pnpm vitest run src/components/ui/Badge.test.tsx`
Expected: PASS (the `ring` boxShadow falls back to `--vt-nav-bg-solid`; sanity check nothing broke).

- [ ] **Step 3: Commit**

```bash
git add pwa/src/theme/tokens.css
git commit -m "feat(pwa): add --vt-nav-* theme tokens for nav gradient"
```

---

### Task 5: Migrate BottomNav badge → `Badge`

**Files:**
- Modify: `pwa/src/components/BottomNav.tsx` (the inline `<span>` dot at lines ~54-66)
- Test: `pwa/src/components/BottomNav.test.tsx`

- [ ] **Step 1: Update the test** to assert the shared Badge dot renders for unread > 0.

Modify `BottomNav.test.tsx`: in a test where `useUnreadCount` returns `{ data: 3 }`, assert `screen.getByLabelText(/unread/i)` is present. Keep the existing minHeight/font test. Add:

```tsx
  it("renders unread dot badge on me tab when unread > 0", async () => {
    const mod = await import("../hooks/useUnreadCount");
    vi.mocked(mod.useUnreadCount).mockReturnValue({ data: 3 } as ReturnType<typeof mod.useUnreadCount>);
    render(<MemoryRouter><BottomNav /></MemoryRouter>);
    expect(screen.getByLabelText(/unread/i)).toBeInTheDocument();
  });
```

(If `useUnreadCount` is mocked inline at module top, switch it to `vi.fn()` so it can be overridden per test, mirroring `ProjectSidebar.test.tsx`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/components/BottomNav.test.tsx`
Expected: FAIL — no element labelled "unread" (current dot has `aria-label={`${count} unread`}` actually — verify; if it already passes, skip to Step 3 by changing the assertion to check the Badge replaced the raw span, e.g. the span no longer has inline `borderRadius:"50%"` hardcode — assert via test id you add).

- [ ] **Step 3: Replace the inline dot**

Add import: `import { Badge } from "./ui/Badge";`
Replace the inline `<span aria-label={`${unread.data} unread`} style={{...8px circle...}} />` with:

```tsx
            {tab.key === "me" && unread.data && unread.data > 0 ? (
              <span style={{ position: "absolute", top: -4, right: -10 }}>
                <Badge variant="dot" ariaLabel={`${unread.data} unread`} />
              </span>
            ) : null}
```

(Keep the absolute positioning wrapper so layout is unchanged; the Badge supplies the 8px dot.)

- [ ] **Step 4: Run tests**

Run: `cd pwa && pnpm vitest run src/components/BottomNav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/components/BottomNav.tsx pwa/src/components/BottomNav.test.tsx
git commit -m "refactor(pwa): BottomNav uses shared Badge dot"
```

---

### Task 6: Migrate `Me.tsx` unread badge → `Badge`

**Files:**
- Modify: `pwa/src/mobile/pages/Me.tsx`
- Test: `pwa/src/mobile/pages/Me.test.tsx` if it exists; otherwise rely on existing component test coverage.

- [ ] **Step 1: Inspect**

Run: `cd pwa && grep -nE "unread|badge|borderRadius|aria-label" src/mobile/pages/Me.tsx` and locate the unread count badge markup. Note whether a test file exists: `ls src/mobile/pages/Me.test.tsx`.

- [ ] **Step 2: Write/adjust test**

If `Me.test.tsx` exists, add an assertion that the unread indicator renders via Badge (e.g. `getByText` of the count). If no test file exists, create a minimal one rendering `Me` with mocked hooks asserting the count shows. Run it to confirm it fails against the not-yet-migrated code only if you changed the rendered output; otherwise this task is a pure internal swap — keep the same rendered number/label and assert it still shows after migration.

- [ ] **Step 3: Replace** the inline unread badge span with `<Badge variant="count" count={unreadCount} />` (import from `../../components/ui/Badge`). Preserve any surrounding label text and positioning. Keep the exact count semantics.

- [ ] **Step 4: Run tests**

Run: `cd pwa && pnpm vitest run src/mobile/pages/Me.test.tsx` (or the suite covering Me).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/mobile/pages/Me.tsx pwa/src/mobile/pages/Me.test.tsx
git commit -m "refactor(pwa): Me unread uses shared Badge"
```

---

### Task 7: Migrate portal `TopBar` NavBadge → `Badge`

**Files:**
- Modify: `pwa/src/portal/TopBar.tsx` (remove local `NavBadge`, use shared `Badge`)
- Modify: `pwa/src/theme/portal.css` (remove now-unused `.portal-topbar__nav-badge` rule, lines ~90-104)
- Test: `pwa/src/portal/TopBar.test.tsx`

- [ ] **Step 1: Inspect** `src/portal/TopBar.tsx` `NavBadge` (lines ~11-22) and its test. Confirm `TopBar.test.tsx` assertions about the badge.

- [ ] **Step 2: Update test** to assert the count renders (e.g. `getByText("3")`) via shared Badge. Run → confirm current state.

- [ ] **Step 3: Replace** the `NavBadge` component usage with `<Badge variant="count" count={unread} tone="danger" />` (import from `../components/ui/Badge`). Delete the local `NavBadge` function. Remove the `.portal-topbar__nav-badge` CSS block from `portal.css`.

- [ ] **Step 4: Run tests**

Run: `cd pwa && pnpm vitest run src/portal/TopBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/TopBar.tsx pwa/src/theme/portal.css pwa/src/portal/TopBar.test.tsx
git commit -m "refactor(pwa): portal TopBar uses shared Badge, drop NavBadge CSS"
```

---

### Task 8: Migrate `NotificationBell` badge + adopt `useDismiss`

**Files:**
- Modify: `pwa/src/portal/notifications/NotificationBell.tsx`
- Test: `pwa/src/portal/notifications/NotificationBell.test.tsx` if present.

- [ ] **Step 1: Inspect** `NotificationBell.tsx` — badge markup (lines ~81-85) and the existing open/close + outside-click logic. Note the popover ref.

- [ ] **Step 2: Update/add test** asserting: badge count renders via shared Badge; pressing Escape (or pointerdown outside) closes the popover. If no test file, create one mocking the notifications hook.

- [ ] **Step 3: Implement**
- Replace the inline badge span with `<Badge variant="count" count={unreadCount} ariaLabel={`${unreadCount} unread`} />` (import from `../../components/ui/Badge`).
- Replace any hand-rolled esc/outside-click effect with `useDismiss(popoverRef, () => setOpen(false), open)` (import from `../../hooks/useDismiss`). Keep the `createPortal` positioning untouched (popover stays a popover, NOT a Modal).
- Ensure the popover wrapper has a `role` (e.g. keep `NotificationPanel`'s existing `role="dialog"`).

- [ ] **Step 4: Run tests**

Run: `cd pwa && pnpm vitest run src/portal/notifications/NotificationBell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/portal/notifications/NotificationBell.tsx pwa/src/portal/notifications/NotificationBell.test.tsx
git commit -m "refactor(pwa): NotificationBell uses shared Badge + useDismiss popover"
```

---

### Task 9: Migrate `ProjectFormModal` → `Modal` (center)

**Files:**
- Modify: `pwa/src/components/ProjectFormModal.tsx`
- Test: `pwa/src/components/ProjectFormModal.test.tsx`

- [ ] **Step 1: Apply the migration recipe**
- Import `Modal` from `./ui/Modal`.
- Remove the outer `<>...</>` containing the backdrop `<div onClick={...0.3...}>` and the centered container `<div style={{position:fixed, top:50%...}}>`.
- Wrap the inner content (h3 + labels + button row) in `<Modal open onClose={onCancel} variant="center" busy={saving} labelledBy="pfm-title">`. Give the `<h3>` `id="pfm-title"`. Keep all field markup, styles, handlers verbatim.
- The component currently is always-rendered when mounted; pass `open={true}` (parent controls mount) OR change to accept the parent's boolean. Since callers conditionally render `{formMode==="create" && <ProjectFormModal .../>}`, keep `open={true}` so behavior is unchanged.
- Remove the now-duplicate saving-guard on backdrop (Modal's `busy` handles it).

- [ ] **Step 2: Update test** — the modal still shows "Buat Proyek", Simpan disabled when empty, onSave trims, onCancel via... the backdrop is now `data-testid="modal-backdrop"`. If a test clicked the old backdrop, update to click `screen.getByTestId("modal-backdrop")`. Keep the 3 behavior assertions.

- [ ] **Step 3: Run tests**

Run: `cd pwa && pnpm vitest run src/components/ProjectFormModal.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/components/ProjectFormModal.tsx pwa/src/components/ProjectFormModal.test.tsx
git commit -m "refactor(pwa): ProjectFormModal uses shared Modal (center)"
```

---

### Task 10: Migrate `QuickAddTaskModal` → `Modal` (center)

**Files:**
- Modify: `pwa/src/components/QuickAddTaskModal.tsx`
- Test: `pwa/src/components/QuickAddTaskModal.test.tsx`

- [ ] **Step 1: Apply recipe** — same as Task 9. Wrap content in `<Modal open onClose={onClose} variant="center" busy={saving} labelledBy="qat-title">`, give `<h3>Tugas Baru</h3>` `id="qat-title"`. Remove hand-rolled backdrop + container + saving guard. Keep the empty-projects branch and form verbatim. Import `Modal` from `./ui/Modal`.

- [ ] **Step 2: Update test** — keep the 3 behavior assertions (empty message, disabled until title, submit calls createTask). No backdrop assertion exists there; if added, use `getByTestId("modal-backdrop")`.

- [ ] **Step 3: Run tests**

Run: `cd pwa && pnpm vitest run src/components/QuickAddTaskModal.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/components/QuickAddTaskModal.tsx pwa/src/components/QuickAddTaskModal.test.tsx
git commit -m "refactor(pwa): QuickAddTaskModal uses shared Modal (center)"
```

---

### Task 11: Migrate `ReloginModal` → `Modal` (center)

**Files:**
- Modify: `pwa/src/components/ReloginModal.tsx`
- Test: `pwa/src/components/ReloginModal.test.tsx` if present.

- [ ] **Step 1: Inspect** the file: it uses an overlay `rgba(0,0,0,0.5)` grid-centered at zIndex 100, with `autoFocus` on the password input. Note its props (open flag? always mounted?).

- [ ] **Step 2: Apply recipe** — wrap content in `<Modal open={<existing open condition or true>} onClose={<existing cancel/dismiss handler>} variant="center" zIndex={100} labelledBy="relogin-title">`. Give the heading an `id="relogin-title"`. Remove the hand-rolled overlay/container. The Modal auto-focuses the first focusable (password input) so the existing `autoFocus` can stay or be removed. Keep the form + submit verbatim.

- [ ] **Step 3: Test** — if a test exists, ensure it still passes (adapt backdrop/structure assertions). If none, add a minimal render test asserting the password field shows. Run `cd pwa && pnpm vitest run src/components/ReloginModal.test.tsx`.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/components/ReloginModal.tsx pwa/src/components/ReloginModal.test.tsx
git commit -m "refactor(pwa): ReloginModal uses shared Modal (center)"
```

---

### Task 12: Migrate `IOSInstallModal` → `Modal` (center)

**Files:**
- Modify: `pwa/src/components/IOSInstallModal.tsx`
- Test: existing test if present.

- [ ] **Step 1: Inspect** — overlay `rgba(0,0,0,0.6)` grid-centered zIndex 110, static instructional content.

- [ ] **Step 2: Apply recipe** — wrap content in `<Modal open onClose={<existing close>} variant="center" zIndex={110} labelledBy="ios-install-title">`. Heading gets `id="ios-install-title"`. Remove hand-rolled overlay/container. Keep the `<ol>` steps verbatim.

- [ ] **Step 3: Test** — run any existing test (`cd pwa && pnpm vitest run src/components/IOSInstallModal.test.tsx`); adapt structure assertions. If none, add a minimal render test for the heading.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/components/IOSInstallModal.tsx pwa/src/components/IOSInstallModal.test.tsx
git commit -m "refactor(pwa): IOSInstallModal uses shared Modal (center)"
```

---

### Task 13: Migrate `FilterSheet` → `Modal` (sheet)

**Files:**
- Modify: `pwa/src/components/FilterSheet.tsx`
- Test: `pwa/src/components/FilterSheet.test.tsx` if present.

- [ ] **Step 1: Inspect** — overlay `rgba(0,0,0,0.5)` zIndex 100, bottom sheet `border-radius:16px 16px 0 0`, maxWidth 480, padding 24. Uses CSS vars already.

- [ ] **Step 2: Apply recipe** — wrap the sheet content in `<Modal open={<existing open>} onClose={<existing close>} variant="sheet" zIndex={100} labelledBy="filter-title">`. Heading (or first label group) gets `id="filter-title"` (add a visually-consistent heading if none exists, or omit `labelledBy`). Remove hand-rolled overlay + sheet container; the inner padding/maxWidth can move to a wrapping `<div style={{maxWidth:480, margin:"0 auto", padding:24}}>` INSIDE Modal children if the sheet variant container doesn't already supply padding (it does not — Modal sheet only sets border-radius + safe-bottom). Keep priority/project/due filters + apply/reset verbatim.

- [ ] **Step 3: Test** — run `cd pwa && pnpm vitest run src/components/FilterSheet.test.tsx`; adapt overlay/structure assertions, keep filter behavior assertions.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/components/FilterSheet.tsx pwa/src/components/FilterSheet.test.tsx
git commit -m "refactor(pwa): FilterSheet uses shared Modal (sheet)"
```

---

### Task 14: Migrate `RejectModal` → `Modal` (sheet)

**Files:**
- Modify: `pwa/src/components/RejectModal.tsx`
- Test: existing test if present.

- [ ] **Step 1: Inspect** — bottom sheet `rgba(0,0,0,0.5)` zIndex 100, safe-area paddingBottom, `autoFocus` textarea, min-5-char reject reason.

- [ ] **Step 2: Apply recipe** — wrap content in `<Modal open={<existing>} onClose={<existing>} variant="sheet" zIndex={100} busy={<submitting flag if any>} labelledBy="reject-title">`. Add a content padding wrapper as in Task 13. Heading gets the id. Keep textarea + validation verbatim.

- [ ] **Step 3: Test** — run `cd pwa && pnpm vitest run src/components/RejectModal.test.tsx`; adapt structure, keep validation behavior.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/components/RejectModal.tsx pwa/src/components/RejectModal.test.tsx
git commit -m "refactor(pwa): RejectModal uses shared Modal (sheet)"
```

---

### Task 15: Migrate `LogProgressModal` → `Modal` (sheet)

**Files:**
- Modify: `pwa/src/components/LogProgressModal.tsx`
- Test: existing test if present.

- [ ] **Step 1: Inspect** — bottom sheet `rgba(0,0,0,0.5)` zIndex 100, safe-area, hours input + optional note, `autoFocus` hours.

- [ ] **Step 2: Apply recipe** — wrap content in `<Modal open={<existing>} onClose={<existing>} variant="sheet" zIndex={100} busy={<submitting flag if any>} labelledBy="logprogress-title">` + content padding wrapper + heading id. Keep hours/note fields + submit verbatim.

- [ ] **Step 3: Test** — run `cd pwa && pnpm vitest run src/components/LogProgressModal.test.tsx`; adapt structure, keep behavior.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/components/LogProgressModal.tsx pwa/src/components/LogProgressModal.test.tsx
git commit -m "refactor(pwa): LogProgressModal uses shared Modal (sheet)"
```

---

### Task 16: Migrate `TaskSlideOver` → `Modal` (slide)

**Files:**
- Modify: `pwa/src/mobile/pages/Project/TaskSlideOver.tsx`
- Test: `pwa/src/mobile/pages/Project/TaskSlideOver.test.tsx`

- [ ] **Step 1: Inspect** — overlay `rgba(0,0,0,0.3)` zIndex 50, right panel width 360 zIndex 51, left shadow. Note its open/close props.

- [ ] **Step 2: Apply recipe** — wrap the panel content in `<Modal open={<existing open>} onClose={<existing close>} variant="slide" zIndex={50} labelledBy="taskslide-title">`. The slide container (width 360, right, shadow) is supplied by Modal's slide variant — remove the hand-rolled one. Heading/title gets the id. Keep task detail/edit content + close button verbatim.

- [ ] **Step 3: Test** — run `cd pwa && pnpm vitest run src/mobile/pages/Project/TaskSlideOver.test.tsx`; adapt overlay/structure assertions, keep open/close + content behavior.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/mobile/pages/Project/TaskSlideOver.tsx pwa/src/mobile/pages/Project/TaskSlideOver.test.tsx
git commit -m "refactor(pwa): TaskSlideOver uses shared Modal (slide)"
```

---

### Task 17: Migrate `TaskCreateModal` (portal) → `Modal` (center)

**Files:**
- Modify: `pwa/src/portal/tasks/TaskCreateModal.tsx`
- Test: `pwa/src/portal/tasks/TaskCreateModal.test.tsx` if present.

- [ ] **Step 1: Inspect** — already has `role="dialog" aria-modal="true" aria-label="Buat Tugas Baru"` (line ~132); styling is CSS-class based. Determine its overlay/container structure and open/close props.

- [ ] **Step 2: Apply recipe** — wrap the form content in `<Modal open={<existing>} onClose={<existing>} variant="center" labelledBy={undefined}>` and rely on Modal's `role/aria-modal`. Since it has an `aria-label` (not labelledBy), keep that aria-label on the inner content wrapper OR set `aria-label` support: simplest — leave the existing inner wrapper with its `aria-label` and let Modal provide the overlay/focus-trap only. To avoid double `role="dialog"`, remove `role`/`aria-modal` from the inner wrapper (Modal now owns them) but move its `aria-label="Buat Tugas Baru"` onto the Modal's dialog: add an optional `ariaLabel?: string` prop to `Modal` (in Task 3's component) — **NOTE:** if `ariaLabel` is needed, add it to Modal: `aria-label={ariaLabel}` on the dialog div, and pass `ariaLabel="Buat Tugas Baru"` here. Update Modal's test to cover `ariaLabel` if you add it.

- [ ] **Step 3: Test** — run `cd pwa && pnpm vitest run src/portal/tasks/TaskCreateModal.test.tsx` and `src/components/ui/Modal.test.tsx`; both PASS.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/portal/tasks/TaskCreateModal.tsx pwa/src/components/ui/Modal.tsx pwa/src/components/ui/Modal.test.tsx pwa/src/portal/tasks/TaskCreateModal.test.tsx
git commit -m "refactor(pwa): TaskCreateModal uses shared Modal; Modal gains ariaLabel"
```

---

### Task 18: Decompose `TopNav.tsx` into `components/TopNav/`

**Files:**
- Create: `pwa/src/components/TopNav/TopNav.tsx`, `NotificationDropdown.tsx`, `AvatarDropdown.tsx`, `icons.tsx`, `breadcrumb.ts`, `index.ts`
- Delete: `pwa/src/components/TopNav.tsx`
- Test: `pwa/src/components/TopNav.test.tsx` (update import path only)

- [ ] **Step 1: Read** the full `src/components/TopNav.tsx` to get verbatim content of each part.

- [ ] **Step 2: Extract leaf modules first**
- `icons.tsx`: export `IconBell`, `IconChevron`, `LogoMark` (verbatim SVG components).
- `breadcrumb.ts`: export `BREADCRUMB_MAP`, `NAV2_ITEMS`, `getBreadcrumb`, `getInitials` (verbatim).
- Replace `C_BG/C_SURFACE/C_BORDER/C_TEXT/C_MUTED/C_PRIMARY/C_PRIMARY_L/C_DANGER/C_DANGER_L` usages with `var(--vt-bg)/var(--vt-surface)/var(--vt-border)/var(--vt-text)/var(--vt-text-muted)/var(--vt-primary)/var(--vt-primary-light)/var(--vt-danger)/#fef2f2` respectively (the `_L` danger has no token — keep `#fef2f2` or add a token; keep literal to avoid scope creep). Replace `C_NAV_*` with `var(--vt-nav-*)`.

- [ ] **Step 3: Extract `NotificationDropdown.tsx`** — verbatim component (props `{ unread: number }`, its `useQuery`/state/effects), but: replace the inline badge span with `<Badge variant="count" count={unread} ring ariaLabel={`${unread} unread`} />` (import from `../ui/Badge`); replace the manual esc/outside-click effect with `useDismiss(ref, () => setOpen(false), open)` (import from `../../hooks/useDismiss`). Import icons from `./icons`.

- [ ] **Step 4: Extract `AvatarDropdown.tsx`** — verbatim (props `{ username }`), replace manual esc/outside-click with `useDismiss`. Import icons + `getInitials` from `./breadcrumb`.

- [ ] **Step 5: Create `TopNav.tsx` shell** — the remaining layout (breadcrumb row, nav2, composition) importing `NotificationDropdown`, `AvatarDropdown`, `getBreadcrumb`, `NAV2_ITEMS`, icons. Keep the public `export function TopNav(...)` signature identical.

- [ ] **Step 6: Create `index.ts`** — `export { TopNav } from "./TopNav";` so existing importers (`import { TopNav } from ".../components/TopNav"`) resolve unchanged. Delete the old `src/components/TopNav.tsx`.

- [ ] **Step 7: Update test import** — `TopNav.test.tsx` imports from `./TopNav`; with the folder + `index.ts`, the path still resolves. Confirm no other change needed.

- [ ] **Step 8: Run tests**

Run: `cd pwa && pnpm vitest run src/components/TopNav.test.tsx`
Expected: PASS (behavior unchanged).

- [ ] **Step 9: Commit**

```bash
git add pwa/src/components/TopNav pwa/src/components/TopNav.test.tsx
git rm pwa/src/components/TopNav.tsx
git commit -m "refactor(pwa): decompose TopNav into folder; use shared Badge + useDismiss + tokens"
```

---

### Task 19: Final verification

- [ ] **Step 1: Full test suite**

Run: `cd pwa && pnpm vitest run`
Expected: all PASS.

- [ ] **Step 2: Type-check**

Run: `cd pwa && NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`
Expected: No errors. Fix any unused imports left from migrations (old style constants, removed components).

- [ ] **Step 3: Build**

Run: `cd pwa && NODE_OPTIONS=--max-old-space-size=4096 pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Grep for leftover duplication**

Run: `cd pwa && grep -rnE "rgba\(0,0,0,0\.(3|5|6)\)" src/components src/mobile src/portal | grep -v ui/Modal.tsx`
Expected: few/no hand-rolled modal overlays remain (any hit should be intentional, e.g. non-modal). Report leftovers.

- [ ] **Step 5: Final commit if fixes applied**

```bash
git add -A
git commit -m "chore(pwa): cleanup after shared-ui refactor"
```

---

## Self-Review

**Spec coverage:**
- §1 primitives → Tasks 1 (useDismiss), 2 (Badge), 3 (Modal). ✓
- §2 Badge + migrate 5 → Tasks 2, 5 (BottomNav), 6 (Me), 7 (TopBar), 8 (NotificationBell), and TopNav notif badge in Task 18. ✓
- §3 Modal + migrate 8 true modals + TaskCreate → Tasks 9-17. ✓ Popover exception (NotificationBell) → Task 8 (useDismiss, not Modal). ✓
- §4 TopNav decompose + `--vt-nav-*` tokens → Tasks 4, 18. ✓
- §5 testing → every task runs the affected test; Task 19 full gate. ✓
- §6 sequencing → task order matches (primitives → tokens → badges → modals → TopNav → verify). ✓
- §7 out-of-scope → no visual redesign, no dark mode, no kanban/offline. ✓

**Placeholder note:** Tasks 6, 11-17 contain explicit inspect steps with grep/ls commands because those modals' exact open/close prop shape and test presence must be read from source (they were not all opened during planning). Each gives the precise target wrapping and the test command — the transformation is fully specified; only the existing prop names are looked up, not invented.

**Type consistency:** `Modal` props `{open,onClose,variant,labelledBy?,busy?,zIndex?,children}` used consistently across Tasks 9-17; Task 17 adds optional `ariaLabel?` to Modal (and its test) before using it. `Badge` props `{variant,count?,max?,tone?,ring?,ariaLabel?}` used consistently in Tasks 5-8 and 18. `useDismiss(ref, handler, active)` signature consistent in Tasks 1, 8, 18.

**Risk:** Tasks 9-17 each keep the modal mounted-when-open contract via `open={true}` for always-mounted-on-condition callers — no caller signature changes. Full suite gate (Task 19) catches any regression.
