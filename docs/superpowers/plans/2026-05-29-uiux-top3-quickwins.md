# UI/UX Top 3 Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 3 highest-impact UX fixes from the 3-perspective review — first-run CTA + in-app create-project, quick-add task modal, and touch-target/offline-banner accessibility fixes.

**Architecture:** Extract the existing inline `ProjectFormModal` into a shared component so both `ProjectSidebar` and `MyWork/List` reuse it (no external Frappe navigation for project creation). Add a new `QuickAddTaskModal` that selects a project (`name`/`title`) and calls the existing `createTask` API. Apply small style fixes to `BottomNav`, `OfflineBanner`, `TaskActions`.

**Tech Stack:** React + Vite, TypeScript, @tanstack/react-query, Vitest + @testing-library/react. Tests mock hooks and API modules (see existing `ProjectSidebar.test.tsx`).

**Conventions (verified):**
- `ProjectRow` type: `{ name: string; title: string; status: ProjectStatus; ... }` — `src/portal/projects/api/types.ts:6`.
- `useProjects(filters: ListFilters)` returns react-query result — `src/portal/projects/hooks/useProjects.ts:6`.
- `createProject/updateProject/deleteProject` — `src/portal/projects/api/projects.ts`.
- `createTask({ project, title, ... })` → `vernon_tasks.api.projects.create_task` — `src/mobile/pages/Project/api.ts:33`.
- Test runner: `cd pwa && pnpm vitest run <path>`. Mock pattern: `vi.mock` on hook/api modules, wrap in `QueryClientProvider` with `retry:false`.

---

### Task 1: Extract shared `ProjectFormModal` component

Move the `ProjectFormModal` defined inline in `ProjectSidebar.tsx:19-90` into its own file, unchanged in behavior, and import it back. Pure refactor — existing ProjectSidebar tests must stay green.

**Files:**
- Create: `pwa/src/components/ProjectFormModal.tsx`
- Modify: `pwa/src/mobile/pages/Project/ProjectSidebar.tsx` (remove inline modal lines 19-90, add import)
- Test: `pwa/src/components/ProjectFormModal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// pwa/src/components/ProjectFormModal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProjectFormModal } from "./ProjectFormModal";

describe("ProjectFormModal", () => {
  it("renders create title and disables save when empty", () => {
    render(<ProjectFormModal mode="create" onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Buat Proyek")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });

  it("calls onSave with trimmed title and status", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProjectFormModal mode="create" onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Gamma  " } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ title: "Gamma", status: "Open" }));
  });

  it("calls onCancel when Batal clicked", () => {
    const onCancel = vi.fn();
    render(<ProjectFormModal mode="create" onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/components/ProjectFormModal.test.tsx`
Expected: FAIL — `Failed to resolve import "./ProjectFormModal"`.

- [ ] **Step 3: Create the component** (cut from `ProjectSidebar.tsx:19-90`, verbatim)

```tsx
// pwa/src/components/ProjectFormModal.tsx
import { useState } from "react";

const PROJECT_STATUSES = ["Open", "On Track", "At Risk", "Closed"] as const;

export interface ProjectFormModalProps {
  mode: "create" | "edit";
  initial?: { title: string; status: string };
  onSave: (values: { title: string; status: string }) => Promise<void>;
  onCancel: () => void;
}

export function ProjectFormModal({ mode, initial, onSave, onCancel }: ProjectFormModalProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [status, setStatus] = useState(initial?.status ?? "Open");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try { await onSave({ title: title.trim(), status }); } finally { setSaving(false); }
  }

  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 60 }}
      />
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        background: "#fff", borderRadius: 12, padding: 24,
        width: 320, maxWidth: "90vw", zIndex: 61,
        boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
      }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
          {mode === "create" ? "Buat Proyek" : "Edit Proyek"}
        </h3>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Nama</span>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
            style={{ border: "1px solid #e8edf3", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#0f172a" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</span>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            style={{ border: "1px solid #e8edf3", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#0f172a" }}
          >
            {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, background: "#f8fafc", border: "1px solid #e8edf3", borderRadius: 8, padding: "9px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#64748b" }}
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            style={{ flex: 2, background: "#7c4dab", color: "#fff", border: "none", borderRadius: 8, padding: "9px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Update ProjectSidebar to import the shared component**

In `pwa/src/mobile/pages/Project/ProjectSidebar.tsx`:
- Delete the inline `ProjectFormModalProps` interface and `ProjectFormModal` function (lines 19-90).
- Delete the now-unused local `const PROJECT_STATUSES` (line 17) — it moved into the component.
- Add import near the top (after existing imports):

```tsx
import { ProjectFormModal } from "../../../components/ProjectFormModal";
```

- [ ] **Step 5: Run tests to verify both pass**

Run: `cd pwa && pnpm vitest run src/components/ProjectFormModal.test.tsx src/mobile/pages/Project/ProjectSidebar.test.tsx`
Expected: PASS — new modal tests green, existing ProjectSidebar tests still green.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/components/ProjectFormModal.tsx pwa/src/components/ProjectFormModal.test.tsx pwa/src/mobile/pages/Project/ProjectSidebar.tsx
git commit -m "refactor(pwa): extract shared ProjectFormModal from ProjectSidebar"
```

---

### Task 2: ProjectSidebar empty-state CTA

When project list is empty and user `canWrite`, show a CTA button that opens the create modal instead of the dead "Tidak ada proyek" text.

**Files:**
- Modify: `pwa/src/mobile/pages/Project/ProjectSidebar.tsx:206-210` (empty-state block)
- Test: `pwa/src/mobile/pages/Project/ProjectSidebar.test.tsx`

- [ ] **Step 1: Write the failing test** (append inside the existing `describe`)

```tsx
  it("shows create CTA in empty state when canWrite, opening the modal", async () => {
    const { useProjects } = await import("../../../portal/projects/hooks/useProjects");
    vi.mocked(useProjects).mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useProjects>);
    wrap(<ProjectSidebar selectedId={null} onSelect={vi.fn()} />);
    const cta = await screen.findByRole("button", { name: /buat proyek pertama/i });
    fireEvent.click(cta);
    expect(screen.getByText("Buat Proyek")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/mobile/pages/Project/ProjectSidebar.test.tsx`
Expected: FAIL — no button matching `/buat proyek pertama/i`.

- [ ] **Step 3: Replace the empty-state block**

In `ProjectSidebar.tsx`, replace the current empty-state (lines 206-210):

```tsx
        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: 16, textAlign: "center" as const }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: canWrite ? 12 : 0 }}>
              Tidak ada proyek
            </div>
            {canWrite && (
              <button
                onClick={() => setFormMode("create")}
                style={{
                  background: "#7c4dab", color: "#fff", border: "none",
                  borderRadius: 8, padding: "8px 14px", fontSize: 12,
                  fontWeight: 700, cursor: "pointer",
                }}
              >
                + Buat proyek pertama
              </button>
            )}
          </div>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/mobile/pages/Project/ProjectSidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/mobile/pages/Project/ProjectSidebar.tsx pwa/src/mobile/pages/Project/ProjectSidebar.test.tsx
git commit -m "feat(pwa): ProjectSidebar empty-state create CTA"
```

---

### Task 3: MyWork "+ Proyek" uses in-app modal

Replace the external Frappe link (`MyWork/List.tsx:84-105`) with a button that opens the shared `ProjectFormModal` in-app and invalidates the projects query on save.

**Files:**
- Modify: `pwa/src/mobile/pages/MyWork/List.tsx` (header `+ Proyek` anchor; add modal state + render)
- Test: `pwa/src/mobile/pages/MyWork/List.test.tsx`

- [ ] **Step 1: Inspect the header component**

Run: `cd pwa && sed -n '1,80p' src/mobile/pages/MyWork/List.tsx`
Identify the component that renders the header (the `Pekerjaan Saya` `<h1>` and the `+ Proyek` anchor at lines ~84-105), its imports, and whether `useQueryClient` is already imported. Note the component name for the test.

- [ ] **Step 2: Write the failing test** (append to `List.test.tsx`, matching its existing import/mock style)

```tsx
  it("opens in-app create-project modal from + Proyek button", async () => {
    renderMyWork(); // use the file's existing render helper
    const btn = await screen.findByRole("button", { name: /buat proyek/i });
    fireEvent.click(btn);
    expect(screen.getByText("Buat Proyek")).toBeInTheDocument();
  });
```

If `List.test.tsx` lacks a render helper, mirror the `wrap()` + `QueryClientProvider` pattern from `ProjectSidebar.test.tsx:29-32` and mock `createProject` via `vi.mock("../../../portal/projects/api/projects", ...)`.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/mobile/pages/MyWork/List.test.tsx`
Expected: FAIL — no button `/buat proyek/i` (current code renders an `<a>`).

- [ ] **Step 4: Add imports + modal state to the header component**

At the top of `List.tsx` add (if missing):

```tsx
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ProjectFormModal } from "../../../components/ProjectFormModal";
import { createProject } from "../../../portal/projects/api/projects";
import { projectKeys } from "../../../portal/projects/hooks/keys";
```

Inside the header component body add:

```tsx
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();
  async function handleCreateProject(values: { title: string; status: string }) {
    await createProject({ title: values.title, status: values.status });
    setShowCreate(false);
    qc.invalidateQueries({ queryKey: projectKeys.lists() });
  }
```

- [ ] **Step 5: Replace the `+ Proyek` anchor with a button + render the modal**

Replace the `<a href="/app/vt-project/new" ...>+ Proyek</a>` (lines ~84-105) with:

```tsx
          <button
            onClick={() => { logEvent("project_create_click", {}); setShowCreate(true); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: INDIGO, color: "#ffffff", border: "none",
              borderRadius: 99, padding: "5px 10px", fontSize: 11,
              fontWeight: 600, cursor: "pointer", lineHeight: 1,
            }}
            aria-label="Buat Proyek"
          >
            + Proyek
          </button>
```

Just before the header component's closing tag (after the `</div>` holding the buttons), render the modal:

```tsx
      {showCreate && (
        <ProjectFormModal
          mode="create"
          onSave={handleCreateProject}
          onCancel={() => setShowCreate(false)}
        />
      )}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/mobile/pages/MyWork/List.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add pwa/src/mobile/pages/MyWork/List.tsx pwa/src/mobile/pages/MyWork/List.test.tsx
git commit -m "feat(pwa): MyWork create-project uses in-app modal instead of external link"
```

---

### Task 4: QuickAddTaskModal component

New modal: select a project (display `title`, submit `name`) + task title input; submit calls `createTask`. Shows a "buat proyek dulu" message when no projects exist.

**Files:**
- Create: `pwa/src/components/QuickAddTaskModal.tsx`
- Test: `pwa/src/components/QuickAddTaskModal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// pwa/src/components/QuickAddTaskModal.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuickAddTaskModal } from "./QuickAddTaskModal";

const createTask = vi.fn().mockResolvedValue({});
vi.mock("../mobile/pages/Project/api", () => ({ createTask: (...a: unknown[]) => createTask(...a) }));

const projects = [
  { name: "PROJ-001", title: "Alpha" },
  { name: "PROJ-002", title: "Beta" },
];

describe("QuickAddTaskModal", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows empty message when no projects", () => {
    render(<QuickAddTaskModal projects={[]} onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByText(/buat proyek dulu/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tambah" })).not.toBeInTheDocument();
  });

  it("disables submit until title entered", () => {
    render(<QuickAddTaskModal projects={projects} onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Tambah" })).toBeDisabled();
  });

  it("submits createTask with selected project name and trimmed title", async () => {
    const onCreated = vi.fn();
    render(<QuickAddTaskModal projects={projects} onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText(/proyek/i), { target: { value: "PROJ-002" } });
    fireEvent.change(screen.getByLabelText(/judul/i), { target: { value: "  Tugas A  " } });
    fireEvent.click(screen.getByRole("button", { name: "Tambah" }));
    await waitFor(() => expect(createTask).toHaveBeenCalledWith({ project: "PROJ-002", title: "Tugas A" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/components/QuickAddTaskModal.test.tsx`
Expected: FAIL — `Failed to resolve import "./QuickAddTaskModal"`.

- [ ] **Step 3: Create the component**

```tsx
// pwa/src/components/QuickAddTaskModal.tsx
import { useState } from "react";
import { createTask } from "../mobile/pages/Project/api";
import { logEvent } from "../telemetry";

export interface QuickAddProject { name: string; title: string; }

interface Props {
  projects: QuickAddProject[];
  onClose: () => void;
  onCreated: () => void;
}

export function QuickAddTaskModal({ projects, onClose, onCreated }: Props) {
  const [project, setProject] = useState(projects[0]?.name ?? "");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!project || !title.trim()) return;
    setSaving(true);
    try {
      await createTask({ project, title: title.trim() });
      logEvent("quick_add_task_submit", { project });
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 60 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        background: "#fff", borderRadius: 12, padding: 24, width: 320, maxWidth: "90vw",
        zIndex: 61, boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
      }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Tugas Baru</h3>
        {projects.length === 0 ? (
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Buat proyek dulu sebelum menambahkan tugas.
          </div>
        ) : (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Proyek</span>
              <select
                value={project}
                onChange={e => setProject(e.target.value)}
                style={{ border: "1px solid #e8edf3", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#0f172a" }}
              >
                {projects.map(p => <option key={p.name} value={p.name}>{p.title}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Judul</span>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
                style={{ border: "1px solid #e8edf3", borderRadius: 6, padding: "8px 10px", fontSize: 13, color: "#0f172a" }}
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={onClose}
                style={{ flex: 1, background: "#f8fafc", border: "1px solid #e8edf3", borderRadius: 8, padding: "9px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#64748b" }}
              >
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !title.trim() || !project}
                style={{ flex: 2, background: "#7c4dab", color: "#fff", border: "none", borderRadius: 8, padding: "9px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Menyimpan..." : "Tambah"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/components/QuickAddTaskModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/components/QuickAddTaskModal.tsx pwa/src/components/QuickAddTaskModal.test.tsx
git commit -m "feat(pwa): QuickAddTaskModal with project picker"
```

---

### Task 5: Wire quick-add button into MyWork header

Add a quick-add task button to the MyWork header that opens `QuickAddTaskModal`, fed by `useProjects`. On created, invalidate the my-work query.

**Files:**
- Modify: `pwa/src/mobile/pages/MyWork/List.tsx` (header component — add button + modal)
- Test: `pwa/src/mobile/pages/MyWork/List.test.tsx`

- [ ] **Step 1: Confirm the my-work query key**

Run: `cd pwa && grep -nE "useQuery|queryKey|my-work|myWork" src/mobile/pages/MyWork/List.tsx | head`
Note the exact `queryKey` used for the my-work list (call it `MYWORK_KEY` below). If a `useProjects` import is needed, it lives at `../../../portal/projects/hooks/useProjects` and returns `{ data: ProjectRow[] }`.

- [ ] **Step 2: Write the failing test** (append to `List.test.tsx`)

```tsx
  it("opens quick-add task modal from header button", async () => {
    renderMyWork(); // existing render helper; ensure useProjects is mocked to return >=1 project
    const btn = await screen.findByRole("button", { name: /tugas baru/i });
    fireEvent.click(btn);
    expect(screen.getByText("Tugas Baru")).toBeInTheDocument();
  });
```

Ensure the test file mocks `useProjects` to return at least one project, e.g.:

```tsx
vi.mock("../../../portal/projects/hooks/useProjects", () => ({
  useProjects: () => ({ data: [{ name: "PROJ-001", title: "Alpha", status: "Open" }], isLoading: false }),
}));
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/mobile/pages/MyWork/List.test.tsx`
Expected: FAIL — no button `/tugas baru/i`.

- [ ] **Step 4: Add imports + state to the header component**

Add (if missing):

```tsx
import { QuickAddTaskModal } from "../../../components/QuickAddTaskModal";
import { useProjects } from "../../../portal/projects/hooks/useProjects";
```

Inside the header component body:

```tsx
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { data: projectRows = [] } = useProjects({});
  const quickAddProjects = projectRows.map(p => ({ name: p.name, title: p.title }));
```

- [ ] **Step 5: Add the button + render the modal**

Add a button next to `+ Proyek` in the header button row:

```tsx
          <button
            onClick={() => { logEvent("quick_add_task_open", {}); setShowQuickAdd(true); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "transparent", color: INDIGO, border: `1px solid ${BD}`,
              borderRadius: 99, padding: "5px 10px", fontSize: 11,
              fontWeight: 600, cursor: "pointer", lineHeight: 1,
            }}
            aria-label="Tugas Baru"
          >
            + Tugas
          </button>
```

Render the modal near the create-project modal:

```tsx
      {showQuickAdd && (
        <QuickAddTaskModal
          projects={quickAddProjects}
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => {
            setShowQuickAdd(false);
            qc.invalidateQueries({ queryKey: MYWORK_KEY }); // use key confirmed in Step 1
          }}
        />
      )}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/mobile/pages/MyWork/List.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add pwa/src/mobile/pages/MyWork/List.tsx pwa/src/mobile/pages/MyWork/List.test.tsx
git commit -m "feat(pwa): quick-add task button in MyWork header"
```

---

### Task 6: BottomNav touch-target + font fix

Bump font size 11→12 and add explicit `minHeight: 48` to each NavLink for WCAG 2.5.5.

**Files:**
- Modify: `pwa/src/components/BottomNav.tsx:40-49`
- Test: `pwa/src/components/TopNav.test.tsx` is unrelated; add a dedicated `BottomNav.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// pwa/src/components/BottomNav.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BottomNav } from "./BottomNav";

vi.mock("../hooks/useUnreadCount", () => ({ useUnreadCount: () => ({ data: 0 }) }));
vi.mock("../hooks/useIsLeader", () => ({ useIsLeader: () => false }));

describe("BottomNav", () => {
  it("renders nav links with >=48px min-height and 12px font", () => {
    render(<MemoryRouter><BottomNav /></MemoryRouter>);
    const link = screen.getByRole("link", { name: /dashboard/i });
    expect(link).toHaveStyle({ minHeight: "48px" });
    expect(link).toHaveStyle({ fontSize: "12px" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/components/BottomNav.test.tsx`
Expected: FAIL — current style has `fontSize: 11` and no `minHeight`.

- [ ] **Step 3: Update the NavLink style**

In `BottomNav.tsx`, change the `style` callback (lines 40-49) — set `fontSize: 12` and add `minHeight: 48`:

```tsx
          style={({ isActive }) => ({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 48,
            color: isActive ? "var(--vt-primary)" : "var(--vt-text-muted)",
            textDecoration: "none",
            fontSize: 12,
            fontWeight: 600,
            position: "relative",
          })}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/components/BottomNav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/components/BottomNav.tsx pwa/src/components/BottomNav.test.tsx
git commit -m "fix(pwa): BottomNav touch target 48px + 12px font (WCAG 2.5.5)"
```

---

### Task 7: OfflineBanner contrast fix

Change banner background from `var(--vt-text-muted)` (fails AA) to `var(--vt-danger)` with white text.

**Files:**
- Modify: `pwa/src/components/OfflineBanner.tsx:32-33`
- Test: `pwa/src/components/OfflineBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// pwa/src/components/OfflineBanner.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineBanner } from "./OfflineBanner";

describe("OfflineBanner", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  });

  it("renders with danger background and white text when offline", () => {
    render(<OfflineBanner />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveStyle({ background: "var(--vt-danger)" });
    expect(banner).toHaveStyle({ color: "#fff" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/components/OfflineBanner.test.tsx`
Expected: FAIL — current background is `var(--vt-text-muted)`, color `var(--vt-bg)`.

- [ ] **Step 3: Update the banner style**

In `OfflineBanner.tsx`, change lines 32-33:

```tsx
        background: "var(--vt-danger)",
        color: "#fff",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/components/OfflineBanner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/components/OfflineBanner.tsx pwa/src/components/OfflineBanner.test.tsx
git commit -m "fix(pwa): OfflineBanner danger background for AA contrast"
```

---

### Task 8: TaskActions min-height

Add `minHeight: 44` to the shared button style so swipe-action buttons meet the vertical tap target.

**Files:**
- Modify: `pwa/src/components/TaskActions.tsx:10-16`
- Test: `pwa/src/components/components.test.tsx` (or a new `TaskActions.test.tsx`)

- [ ] **Step 1: Write the failing test**

```tsx
// pwa/src/components/TaskActions.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskActions } from "./TaskActions";

describe("TaskActions", () => {
  it("buttons have >=44px min-height", () => {
    render(<TaskActions onComplete={vi.fn()} onLog={vi.fn()} onSnooze={vi.fn()} />);
    const btns = screen.getAllByRole("button");
    btns.forEach(b => expect(b).toHaveStyle({ minHeight: "44px" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pwa && pnpm vitest run src/components/TaskActions.test.tsx`
Expected: FAIL — `BTN_STYLE` has no `minHeight`.

- [ ] **Step 3: Update `BTN_STYLE`**

In `TaskActions.tsx`, add `minHeight: 44` to `BTN_STYLE` (lines 10-16):

```tsx
const BTN_STYLE: React.CSSProperties = {
  flex: 1,
  border: 0,
  color: "white",
  fontSize: 13,
  fontWeight: 600,
  minHeight: 44,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pwa && pnpm vitest run src/components/TaskActions.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/components/TaskActions.tsx pwa/src/components/TaskActions.test.tsx
git commit -m "fix(pwa): TaskActions buttons 44px min-height"
```

---

### Task 9: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `cd pwa && pnpm vitest run`
Expected: all tests PASS (existing + new).

- [ ] **Step 2: Run the linter**

Run: `cd pwa && pnpm lint`
Expected: no errors. Fix any reported issues (e.g., unused imports left from Task 1 extraction).

- [ ] **Step 3: Type-check / build**

Run: `cd pwa && pnpm build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Final commit if any lint/type fixes were applied**

```bash
git add -A
git commit -m "chore(pwa): lint and type fixes for top-3 UX quick wins"
```

---

## Self-Review

**Spec coverage:**
- §1 first-run CTA + in-app create-project → Tasks 1, 2, 3. ✓
- §2 quick-add task (modal + project picker) → Tasks 4, 5. ✓
- §3 touch target + offline banner → Tasks 6 (BottomNav), 7 (OfflineBanner), 8 (TaskActions). ✓
- §4 testing → each task is TDD; Task 9 full-suite + lint + build. ✓
- §5 out-of-scope items → not implemented (correct). ✓
- §6 rejected claim → no task (correct — verified false). ✓

**Type consistency:** `createTask({ project, title })` matches `Project/api.ts:33`. `ProjectFormModal` props identical before/after extraction. `QuickAddTaskModal` `QuickAddProject {name,title}` derived from `ProjectRow`. `useProjects({})` matches `ListFilters` (empty object = no filter, mirrors ProjectSidebar `filters = {}`).

**Placeholder scan:** Two deliberate lookup steps (Task 3 Step 1, Task 5 Step 1) inspect existing code because `MyWork/List.tsx` header component name and the my-work query key must be read from source rather than guessed — each has an exact command and what to extract. No vague "add error handling" placeholders.
