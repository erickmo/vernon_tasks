# Sprint Kanban Mobile Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development / test-driven-development. Strict Red-Green-Refactor per task: write the failing test FIRST, run it, watch it fail, then implement the minimum to pass. Reuse the portal types and `lib/rank.ts` via import — never duplicate rank math or column constants.

## Goal

Ship a mobile sprint board at `/m/sprint/:sprintId` that mirrors the desktop kanban: horizontal-scroll columns, two-axis toggle (`kanban_status` ↔ `pdca_phase`), and drag-to-move via @dnd-kit backed by the existing `move_task` / `get_sprint_with_relations` / `rebalance_column` endpoints. Entry point is the (currently read-only) `SprintCommitmentCard` on the dashboard MeTab. No new Python; no offline outbox (out of scope).

## Architecture

| File | Responsibility | Action |
|------|----------------|--------|
| `pwa/src/mobile/pages/Sprint/api.ts` | Thin wrappers re-exporting portal `getSprintWithRelations`/`moveTask`/`rebalanceColumn` so endpoint paths stay single-sourced. | create |
| `pwa/src/mobile/pages/Sprint/hooks/useSprintBoard.ts` | react-query `useQuery(["mobileSprintBoard", sprintId])` + `move` mutation (optimistic local reorder via `setQueryData`, `computeRank`, `needsRebalance` → `rebalanceColumn`, rollback on error). | create |
| `pwa/src/mobile/pages/Sprint/lib/columns.ts` | `KANBAN_COLS` / `PDCA_COLS` + `columnsFor(axis)`. | create |
| `pwa/src/mobile/pages/Sprint/MobileTaskCard.tsx` | Draggable card: title, assignee, priority dot, hours; `--pending` style. | create |
| `pwa/src/mobile/pages/Sprint/MobileKanbanColumn.tsx` | Droppable column (`useDroppable`) wrapping a `SortableContext`; header title + count. | create |
| `pwa/src/mobile/pages/Sprint/SprintBoardMobile.tsx` | Page: header (title + axis toggle), `DndContext` (PointerSensor + TouchSensor), horizontal-scroll strip, skeleton/empty/error/toast states. | create |
| `pwa/src/router.tsx` | Register `/m/sprint/:sprintId` under existing guards/AppShell. | modify |
| `pwa/src/mobile/pages/Dashboard/components/SprintCommitmentCard.tsx` | Make tappable → `navigate(/m/sprint/${sprint.name})`; fire `sprint_board_open`. | modify |
| `pwa/src/telemetry.ts` | Add `sprint_board_open`, `sprint_task_move`, `sprint_axis_toggle` to union + helper fns. | modify |

Reuse (import, never copy): `portal/sprints/api/types.ts` (`TaskCardData`, `KanbanStatus`, `PdcaPhase`, `BoardAxis`, `SprintDetail`, `MoveTaskPayload`), `portal/sprints/lib/rank.ts` (`computeRank`, `needsRebalance`), `portal/sprints/api/sprints.ts` (`getSprintWithRelations`, `moveTask`, `rebalanceColumn`). Do NOT touch unused `components/KanbanCard`/`KanbanColumn` stubs.

IMPORTANT before coding: re-read `portal/sprints/api/types.ts`, `portal/sprints/api/sprints.ts`, `portal/sprints/hooks/useTaskBoard.ts`, `portal/sprints/lib/rank.ts`, `router.tsx`, `components/Toast`, `components/EmptyState`, `components/PageSkeleton`, `mobile/pages/Dashboard/components/SprintCommitmentCard.tsx`, and the `MeSprint`/`SprintDetail` types — adapt all type names/field names/exports below to the REAL ones (the test fixtures here assume specific field names; fix them to match).

## Tech Stack

TypeScript, React 18, `@tanstack/react-query` v5, `@dnd-kit/core` v6 + `@dnd-kit/sortable` v8 + `@dnd-kit/utilities`, `react-router-dom`, Vitest + `@testing-library/react`. Tests: `cd pwa && pnpm vitest run <path>`. Drag tests invoke the `onDragEnd` handler directly with a synthetic `DragEndEvent` (jsdom/happy-dom cannot do real pointer drag). Optimistic update pattern from `useTaskBoard.ts`: snapshot `prev = qc.getQueryData(key)`, optimistic `setQueryData`, on catch `setQueryData(key, prev)` + rethrow. Drop-target id convention `tcol-<columnValue>`.

---

## Task 1 — Telemetry events

**Files:** modify `pwa/src/telemetry.ts` + create `pwa/src/mobile/pages/Sprint/telemetry.test.ts`

### Failing test
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../../../api/client";
import { trackSprintBoardOpen, trackSprintTaskMoveMobile, trackSprintAxisToggle } from "../../../telemetry";

vi.mock("../../../api/client", () => ({ api: { post: vi.fn(() => Promise.resolve()) } }));

describe("mobile sprint telemetry", () => {
  beforeEach(() => vi.clearAllMocks());
  it("logs sprint_board_open with sprint", () => {
    trackSprintBoardOpen("SP-1");
    expect(api.post).toHaveBeenCalledWith("/api/method/vernon_tasks.task.api.telemetry.log_event", { event: "sprint_board_open", props: { sprint: "SP-1" } });
  });
  it("logs sprint_task_move with from/to/axis", () => {
    trackSprintTaskMoveMobile("Backlog", "In Progress", "kanban_status");
    expect(api.post).toHaveBeenCalledWith("/api/method/vernon_tasks.task.api.telemetry.log_event", { event: "sprint_task_move", props: { from: "Backlog", to: "In Progress", axis: "kanban_status" } });
  });
  it("logs sprint_axis_toggle with axis", () => {
    trackSprintAxisToggle("pdca_phase");
    expect(api.post).toHaveBeenCalledWith("/api/method/vernon_tasks.task.api.telemetry.log_event", { event: "sprint_axis_toggle", props: { axis: "pdca_phase" } });
  });
});
```
NOTE: verify the real `logEvent` post shape + telemetry endpoint path in `telemetry.ts`; adapt assertions + helper bodies. Run → FAIL.

### Implement
Add to `TelemetryEvent` union: `"sprint_board_open" | "sprint_task_move" | "sprint_axis_toggle"`. Append helpers using the file's own `logEvent` (match its real internal call form):
```ts
export function trackSprintBoardOpen(sprint: string) { logEvent("sprint_board_open", { sprint }); }
export function trackSprintTaskMoveMobile(from: string, to: string, axis: "kanban_status" | "pdca_phase") { logEvent("sprint_task_move", { from, to, axis }); }
export function trackSprintAxisToggle(axis: "kanban_status" | "pdca_phase") { logEvent("sprint_axis_toggle", { axis }); }
```
Run pass. Commit: `feat(mobile-sprint): add sprint board telemetry events`

---

## Task 2 — Column constants

**Files:** create `pwa/src/mobile/pages/Sprint/lib/columns.ts` + `.test.ts`

### Failing test
```ts
import { describe, it, expect } from "vitest";
import { KANBAN_COLS, PDCA_COLS, columnsFor } from "./columns";

describe("sprint columns", () => {
  it("kanban has 7 statuses in order", () => {
    expect(KANBAN_COLS).toEqual(["Backlog","Scheduled","In Progress","In Review","Revision","Done","Blocked"]);
  });
  it("pdca has 6 phases in order", () => {
    expect(PDCA_COLS).toEqual(["BACKLOG","PLAN","DO","CHECK","ACT","DONE"]);
  });
  it("columnsFor returns the right set per axis", () => {
    expect(columnsFor("kanban_status")).toBe(KANBAN_COLS);
    expect(columnsFor("pdca_phase")).toBe(PDCA_COLS);
  });
});
```
Run → FAIL.

### Implement
```ts
import type { KanbanStatus, PdcaPhase, BoardAxis } from "../../../../portal/sprints/api/types";
export const KANBAN_COLS: readonly KanbanStatus[] = ["Backlog","Scheduled","In Progress","In Review","Revision","Done","Blocked"];
export const PDCA_COLS: readonly PdcaPhase[] = ["BACKLOG","PLAN","DO","CHECK","ACT","DONE"];
export function columnsFor(axis: BoardAxis): readonly string[] {
  return axis === "kanban_status" ? KANBAN_COLS : PDCA_COLS;
}
```
Run pass. Commit: `feat(mobile-sprint): add column constants helper`

---

## Task 3 — API wrappers

**Files:** create `pwa/src/mobile/pages/Sprint/api.ts` + `api.test.ts`

### Failing test
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../../../api/client";
import { getSprintBoard, moveTask, rebalanceColumn } from "./api";

vi.mock("../../../api/client", () => ({ api: { get: vi.fn(() => Promise.resolve({})), post: vi.fn(() => Promise.resolve({})) } }));

describe("mobile sprint api", () => {
  beforeEach(() => vi.clearAllMocks());
  it("getSprintBoard hits get_sprint_with_relations with name", async () => {
    await getSprintBoard("SP-1");
    expect(api.get).toHaveBeenCalledWith("/api/method/vernon_tasks.api.sprints.get_sprint_with_relations", { name: "SP-1" });
  });
  it("moveTask posts move_task with axis field + rank", async () => {
    await moveTask({ task: "T-1", kanban_status: "In Progress", kanban_rank: 1500 });
    expect(api.post).toHaveBeenCalledWith("/api/method/vernon_tasks.api.sprints.move_task", { task: "T-1", kanban_status: "In Progress", kanban_rank: 1500 });
  });
  it("rebalanceColumn posts rebalance_column with column_value", async () => {
    await rebalanceColumn("SP-1", "kanban_status", "Done");
    expect(api.post).toHaveBeenCalledWith("/api/method/vernon_tasks.api.sprints.rebalance_column", { sprint: "SP-1", axis: "kanban_status", column_value: "Done" });
  });
});
```
NOTE: confirm the portal functions' actual signatures/return; if the portal `moveTask` already assembles the payload, these wrappers just delegate. Run → FAIL.

### Implement
```ts
import { getSprintWithRelations, moveTask as portalMoveTask, rebalanceColumn as portalRebalanceColumn } from "../../../portal/sprints/api/sprints";
import type { SprintDetail, MoveTaskPayload, BoardAxis } from "../../../portal/sprints/api/types";
export function getSprintBoard(sprintId: string): Promise<SprintDetail> { return getSprintWithRelations(sprintId); }
export function moveTask(payload: MoveTaskPayload) { return portalMoveTask(payload); }
export function rebalanceColumn(sprint: string, axis: BoardAxis, columnValue: string) { return portalRebalanceColumn(sprint, axis, columnValue); }
```
Run pass. Commit: `feat(mobile-sprint): add api wrappers reusing portal endpoints`

---

## Task 4 — useSprintBoard hook

**Files:** create `pwa/src/mobile/pages/Sprint/hooks/useSprintBoard.ts` + `.test.tsx`

### Failing test
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SprintDetail } from "../../../../portal/sprints/api/types";
import { useSprintBoard } from "./useSprintBoard";

vi.mock("../api", () => ({
  getSprintBoard: vi.fn(),
  moveTask: vi.fn(async (p: Record<string, unknown>) => ({ ...p })),
  rebalanceColumn: vi.fn(async () => ({})),
}));
import { getSprintBoard, moveTask, rebalanceColumn } from "../api";

const detail: SprintDetail = {
  sprint: { name: "SP-1", sprint_title: "S", project: "PR-1", start_date: null, end_date: null, status: "Active", goal: null },
  project_summary: null,
  tasks: [
    { name: "T-1", title: "A", assigned_to: "u@x", kanban_status: "Backlog", pdca_phase: "PLAN", kanban_rank: 1000, estimated_hours: 2, weight: 1, priority: "Low", deadline: null },
    { name: "T-2", title: "B", assigned_to: "u@x", kanban_status: "Backlog", pdca_phase: "PLAN", kanban_rank: 2000, estimated_hours: 3, weight: 1, priority: "Medium", deadline: null },
  ],
};

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useSprintBoard", () => {
  beforeEach(() => { vi.clearAllMocks(); (getSprintBoard as any).mockResolvedValue(detail); });
  it("loads the sprint detail", async () => {
    const { result } = renderHook(() => useSprintBoard("SP-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.tasks).toHaveLength(2));
    expect(getSprintBoard).toHaveBeenCalledWith("SP-1");
  });
  it("move() calls moveTask with axis field + computed rank", async () => {
    const { result } = renderHook(() => useSprintBoard("SP-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => {
      await result.current.move.mutateAsync({ task: "T-1", axis: "kanban_status", targetColumn: "In Progress", prevRank: 2000, nextRank: null });
    });
    expect(moveTask).toHaveBeenCalledWith({ task: "T-1", kanban_status: "In Progress", kanban_rank: 3000 });
  });
  it("rolls back optimistic state on move error", async () => {
    (moveTask as any).mockRejectedValueOnce(new Error("PermissionError"));
    const { result } = renderHook(() => useSprintBoard("SP-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => { await result.current.move.mutateAsync({ task: "T-1", axis: "kanban_status", targetColumn: "Done", prevRank: 2000, nextRank: null }).catch(() => {}); });
    const t1 = result.current.data!.tasks.find(t => t.name === "T-1")!;
    expect(t1.kanban_status).toBe("Backlog");
  });
  it("rebalances when rank collides", async () => {
    const { result } = renderHook(() => useSprintBoard("SP-1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    await act(async () => { await result.current.move.mutateAsync({ task: "T-2", axis: "kanban_status", targetColumn: "Backlog", prevRank: 1000, nextRank: 1000.00005 }); });
    expect(rebalanceColumn).toHaveBeenCalledWith("SP-1", "kanban_status", "Backlog");
  });
});
```
Run → FAIL. (Verify `computeRank(2000,null)` actually yields 3000 per `rank.ts` RANK_STEP=1000; adjust expectation to the real value.)

### Implement
```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSprintBoard, moveTask, rebalanceColumn } from "../api";
import type { SprintDetail, TaskCardData, BoardAxis, MoveTaskPayload } from "../../../../portal/sprints/api/types";
import { computeRank, needsRebalance } from "../../../../portal/sprints/lib/rank";

export interface MoveArgs { task: string; axis: BoardAxis; targetColumn: string; prevRank: number | null; nextRank: number | null; }

export function useSprintBoard(sprintId: string) {
  const qc = useQueryClient();
  const key = ["mobileSprintBoard", sprintId];
  const query = useQuery({ queryKey: key, queryFn: () => getSprintBoard(sprintId), enabled: !!sprintId });
  const move = useMutation({
    mutationFn: async (args: MoveArgs) => {
      const newRank = computeRank(args.prevRank, args.nextRank);
      const prev = qc.getQueryData<SprintDetail>(key);
      if (prev) {
        const tasks: TaskCardData[] = prev.tasks.map(t =>
          t.name === args.task ? ({ ...t, [args.axis]: args.targetColumn, kanban_rank: newRank } as TaskCardData) : t);
        qc.setQueryData<SprintDetail>(key, { ...prev, tasks });
      }
      try {
        const payload: MoveTaskPayload = { task: args.task, kanban_rank: newRank };
        payload[args.axis] = args.targetColumn as never;
        const res = await moveTask(payload);
        if (args.prevRank != null && needsRebalance(args.prevRank, newRank)) {
          await rebalanceColumn(sprintId, args.axis, args.targetColumn);
          await qc.invalidateQueries({ queryKey: key });
        }
        return res;
      } catch (e) {
        if (prev) qc.setQueryData(key, prev);
        throw e;
      }
    },
  });
  return { ...query, move };
}
```
Run pass. Commit: `feat(mobile-sprint): add useSprintBoard hook with optimistic move + rebalance`

---

## Task 5 — MobileTaskCard

**Files:** create `pwa/src/mobile/pages/Sprint/MobileTaskCard.tsx` + `.test.tsx`

### Failing test
```ts
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileTaskCard } from "./MobileTaskCard";
import type { TaskCardData } from "../../../portal/sprints/api/types";

const task: TaskCardData = { name: "T-1", title: "Ship login", assigned_to: "u@x", kanban_status: "Backlog", pdca_phase: "PLAN", kanban_rank: 1000, estimated_hours: 4, weight: 1, priority: "High", deadline: null };

describe("MobileTaskCard", () => {
  it("renders title, assignee, hours and priority class", () => {
    render(<MobileTaskCard task={task} />);
    expect(screen.getByText("Ship login")).toBeInTheDocument();
    expect(screen.getByText("u@x")).toBeInTheDocument();
    expect(screen.getByText("4h")).toBeInTheDocument();
    expect(screen.getByTestId("mtask-T-1").className).toContain("prio-high");
  });
  it("shows em dash when unassigned", () => {
    render(<MobileTaskCard task={{ ...task, assigned_to: null }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
  it("applies pending modifier when pending", () => {
    render(<MobileTaskCard task={task} pending />);
    expect(screen.getByTestId("mtask-T-1").className).toContain("m-task-card--pending");
  });
});
```
Run → FAIL.

### Implement
```tsx
import type { TaskCardData } from "../../../portal/sprints/api/types";
interface Props { task: TaskCardData; pending?: boolean; }
export function MobileTaskCard({ task, pending = false }: Props) {
  const cls = ["m-task-card", `prio-${task.priority.toLowerCase()}`];
  if (pending) cls.push("m-task-card--pending");
  return (
    <div data-testid={`mtask-${task.name}`} className={cls.join(" ")}
      style={{ background: "var(--vt-card, #fff)", borderRadius: 10, boxShadow: "0 1px 2px rgba(0,0,0,0.06)", padding: "10px 12px", marginBottom: 8, opacity: pending ? 0.6 : 1, touchAction: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: "currentColor" }} />
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, minWidth: 0 }}>{task.title}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--vt-text-muted, #64748b)" }}>
        <span>{task.assigned_to ?? "—"}</span>
        <span>{task.estimated_hours}h</span>
      </div>
    </div>
  );
}
```
Run pass. Commit: `feat(mobile-sprint): add MobileTaskCard`

---

## Task 6 — MobileKanbanColumn

**Files:** create `pwa/src/mobile/pages/Sprint/MobileKanbanColumn.tsx` + `.test.tsx`

### Failing test
```ts
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { MobileKanbanColumn } from "./MobileKanbanColumn";
import type { TaskCardData } from "../../../portal/sprints/api/types";

const tasks: TaskCardData[] = [
  { name: "T-1", title: "A", assigned_to: "u@x", kanban_status: "Backlog", pdca_phase: "PLAN", kanban_rank: 1000, estimated_hours: 2, weight: 1, priority: "Low", deadline: null },
  { name: "T-2", title: "B", assigned_to: "u@x", kanban_status: "Backlog", pdca_phase: "PLAN", kanban_rank: 2000, estimated_hours: 3, weight: 1, priority: "Medium", deadline: null },
];

describe("MobileKanbanColumn", () => {
  it("renders title, count and cards inside a DndContext", () => {
    render(<DndContext><MobileKanbanColumn column="Backlog" tasks={tasks} pendingTaskId={null} /></DndContext>);
    const col = screen.getByTestId("mcol-Backlog");
    expect(col).toHaveTextContent("Backlog");
    expect(col).toHaveTextContent("2");
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
```
Run → FAIL.

### Implement
```tsx
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MobileTaskCard } from "./MobileTaskCard";
import type { TaskCardData } from "../../../portal/sprints/api/types";

interface Props { column: string; tasks: TaskCardData[]; pendingTaskId: string | null; }

function SortableCard({ task, pending }: { task: TaskCardData; pending: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.name });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (<div ref={setNodeRef} style={style} {...attributes} {...listeners}><MobileTaskCard task={task} pending={pending} /></div>);
}

export function MobileKanbanColumn({ column, tasks, pendingTaskId }: Props) {
  const { setNodeRef } = useDroppable({ id: `tcol-${column}` });
  return (
    <div ref={setNodeRef} id={`tcol-${column}`} data-testid={`mcol-${column}`}
      style={{ minWidth: "80vw", scrollSnapAlign: "start", background: "var(--vt-bg-subtle, #f1f5f9)", borderRadius: 12, padding: 10, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{column}</h4>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--vt-text-muted, #64748b)" }}>{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map(t => t.name)} strategy={verticalListSortingStrategy}>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {tasks.map(t => <SortableCard key={t.name} task={t} pending={t.name === pendingTaskId} />)}
        </div>
      </SortableContext>
    </div>
  );
}
```
Run pass. Commit: `feat(mobile-sprint): add MobileKanbanColumn droppable/sortable`

---

## Task 7 — SprintBoardMobile page (render, states, axis toggle, drag)

**Files:** create `pwa/src/mobile/pages/Sprint/SprintBoardMobile.tsx` + `.test.tsx`

The drag logic is extracted to a pure exported `__onDragEndForTest` (resolve column by `tcol-` id, else by the dropped-over task's `[axis]`; compute prev/next rank from the destination column's sorted tasks).

### Failing test
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ReactElement } from "react";
import type { SprintDetail } from "../../../portal/sprints/api/types";

vi.mock("./api", () => ({
  getSprintBoard: vi.fn(),
  moveTask: vi.fn(async (p: Record<string, unknown>) => ({ ...p })),
  rebalanceColumn: vi.fn(async () => ({})),
}));
import { getSprintBoard } from "./api";
import { SprintBoardMobile, __onDragEndForTest } from "./SprintBoardMobile";

const detail: SprintDetail = {
  sprint: { name: "SP-1", sprint_title: "Sprint One", project: "PR-1", start_date: null, end_date: null, status: "Active", goal: null },
  project_summary: null,
  tasks: [
    { name: "T-1", title: "Alpha", assigned_to: "u@x", kanban_status: "Backlog", pdca_phase: "PLAN", kanban_rank: 1000, estimated_hours: 2, weight: 1, priority: "Low", deadline: null },
    { name: "T-2", title: "Beta", assigned_to: "u@x", kanban_status: "In Progress", pdca_phase: "DO", kanban_rank: 1000, estimated_hours: 3, weight: 1, priority: "Medium", deadline: null },
  ],
};

function wrap(ui: ReactElement, path = "/m/sprint/SP-1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[path]}><Routes><Route path="/m/sprint/:sprintId" element={ui} /></Routes></MemoryRouter></QueryClientProvider>);
}

describe("SprintBoardMobile", () => {
  beforeEach(() => { vi.clearAllMocks(); (getSprintBoard as any).mockResolvedValue(detail); });
  it("renders kanban columns by default and places tasks", async () => {
    wrap(<SprintBoardMobile />);
    await waitFor(() => expect(screen.getByTestId("mcol-Backlog")).toBeInTheDocument());
    expect(screen.getByTestId("mcol-Backlog")).toHaveTextContent("Alpha");
    expect(screen.getByTestId("mcol-In Progress")).toHaveTextContent("Beta");
    ["Backlog","Scheduled","In Progress","In Review","Revision","Done","Blocked"].forEach(c => expect(screen.getByTestId(`mcol-${c}`)).toBeInTheDocument());
  });
  it("toggles axis to pdca columns", async () => {
    wrap(<SprintBoardMobile />);
    await waitFor(() => expect(screen.getByTestId("mcol-Backlog")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /pdca/i }));
    ["BACKLOG","PLAN","DO","CHECK","ACT","DONE"].forEach(c => expect(screen.getByTestId(`mcol-${c}`)).toBeInTheDocument());
  });
  it("shows empty state when no tasks", async () => {
    (getSprintBoard as any).mockResolvedValue({ ...detail, tasks: [] });
    wrap(<SprintBoardMobile />);
    await waitFor(() => expect(screen.getByText(/no tasks/i)).toBeInTheDocument());
  });
  it("shows error state with retry", async () => {
    (getSprintBoard as any).mockRejectedValue(new Error("boom"));
    wrap(<SprintBoardMobile />);
    await waitFor(() => expect(screen.getByText(/failed to load/i)).toBeInTheDocument());
  });
  it("onDragEnd handler resolves target column and calls move", () => {
    const move = vi.fn();
    __onDragEndForTest({ active: { id: "T-1" }, over: { id: "tcol-In Progress" } } as any, { axis: "kanban_status", tasks: detail.tasks, move, sprintId: "SP-1" });
    expect(move).toHaveBeenCalledWith(expect.objectContaining({ task: "T-1", axis: "kanban_status", targetColumn: "In Progress" }));
  });
  it("onDragEnd resolves target column when dropped over a card", () => {
    const move = vi.fn();
    __onDragEndForTest({ active: { id: "T-1" }, over: { id: "T-2" } } as any, { axis: "kanban_status", tasks: detail.tasks, move, sprintId: "SP-1" });
    expect(move).toHaveBeenCalledWith(expect.objectContaining({ targetColumn: "In Progress" }));
  });
});
```
NOTE: adapt `EmptyState`/`PageSkeleton`/`useToast` prop shapes + the empty/error copy to the real components. Run → FAIL.

### Implement
```tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useSprintBoard, type MoveArgs } from "./hooks/useSprintBoard";
import { MobileKanbanColumn } from "./MobileKanbanColumn";
import { columnsFor } from "./lib/columns";
import { PageSkeleton } from "../../../components/PageSkeleton";
import { EmptyState } from "../../../components/EmptyState";
import { useToast } from "../../../components/Toast";
import * as telemetry from "../../../telemetry";
import type { TaskCardData, BoardAxis } from "../../../portal/sprints/api/types";

interface DragCtx { axis: BoardAxis; tasks: TaskCardData[]; sprintId: string; move: (args: MoveArgs) => void; }

export function __onDragEndForTest(ev: DragEndEvent, ctx: DragCtx) {
  const { axis, tasks, move } = ctx;
  const taskId = String(ev.active.id);
  const overId = ev.over?.id ? String(ev.over.id) : null;
  if (!overId) return;
  const cols = columnsFor(axis);
  const targetCol = cols.find(c => overId === `tcol-${c}`) ?? (tasks.find(t => t.name === overId)?.[axis] as string | undefined);
  if (!targetCol) return;
  const task = tasks.find(t => t.name === taskId);
  if (!task) return;
  if (task[axis] === targetCol && overId === `tcol-${targetCol}`) return;
  const colTasks = tasks.filter(t => t[axis] === targetCol && t.name !== taskId).sort((a, b) => (a.kanban_rank ?? 0) - (b.kanban_rank ?? 0));
  const lastRank = colTasks.length ? colTasks[colTasks.length - 1].kanban_rank : null;
  move({ task: taskId, axis, targetColumn: targetCol, prevRank: lastRank, nextRank: null });
  telemetry.trackSprintTaskMoveMobile(task[axis] as string, targetCol, axis);
}

export function SprintBoardMobile() {
  const { sprintId = "" } = useParams<{ sprintId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [axis, setAxis] = useState<BoardAxis>("kanban_status");
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch, move } = useSprintBoard(sprintId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  useEffect(() => { if (sprintId) telemetry.trackSprintBoardOpen(sprintId); }, [sprintId]);

  if (isLoading) return <PageSkeleton />;
  if (isError || !data) return <EmptyState title="Failed to load sprint" cta={{ label: "Retry", onClick: () => refetch() }} />;

  function dispatchMove(args: MoveArgs) {
    setPendingTaskId(args.task);
    move.mutate(args, { onError: () => toast.show("Move failed — reverted"), onSettled: () => setPendingTaskId(null) });
  }
  function onToggle() {
    const next: BoardAxis = axis === "kanban_status" ? "pdca_phase" : "kanban_status";
    setAxis(next); telemetry.trackSprintAxisToggle(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px 0" }}>
        <button onClick={() => navigate("/m/dashboard")} aria-label="Back" style={{ background: "transparent", border: 0, fontSize: 18 }}>‹</button>
        <h2 style={{ margin: 0, fontSize: 16, flex: 1, minWidth: 0 }}>{data.sprint.sprint_title}</h2>
        <button onClick={onToggle} style={{ fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 99, border: "1px solid var(--vt-border, #e2e8f0)" }}>
          {axis === "kanban_status" ? "Switch to PDCA" : "Switch to Kanban"}
        </button>
      </div>
      {data.tasks.length === 0 ? (
        <EmptyState title="No tasks in this sprint" body="Tasks added in the portal will appear here." />
      ) : (
        <DndContext sensors={sensors} onDragEnd={(ev) => __onDragEndForTest(ev, { axis, tasks: data.tasks, sprintId, move: dispatchMove })}>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", padding: "12px", flex: 1, WebkitOverflowScrolling: "touch" }}>
            {columnsFor(axis).map(col => {
              const colTasks = data.tasks.filter(t => (t[axis] as string) === col).sort((a, b) => (a.kanban_rank ?? 0) - (b.kanban_rank ?? 0));
              return <MobileKanbanColumn key={col} column={col} tasks={colTasks} pendingTaskId={pendingTaskId} />;
            })}
          </div>
        </DndContext>
      )}
    </div>
  );
}
```
Run pass. Commit: `feat(mobile-sprint): add SprintBoardMobile page with axis toggle, drag, states`

---

## Task 8 — Router route

**Files:** modify `pwa/src/router.tsx` + create `pwa/src/mobile/pages/Sprint/route.test.tsx`

### Failing test
```ts
import { describe, it, expect } from "vitest";
import { router } from "../../../router";
function paths(routes: any[]): string[] {
  return routes.flatMap(r => [r.path, ...(r.children ? paths(r.children) : [])]).filter(Boolean);
}
describe("mobile sprint route", () => {
  it("registers /m/sprint/:sprintId", () => {
    expect(paths(router.routes as any[])).toContain("/m/sprint/:sprintId");
  });
});
```
NOTE: confirm `router.tsx` exports a `router` object with `.routes` (or adapt the assertion to however routes are exposed). Run → FAIL.

### Implement
Import `SprintBoardMobile` and add `{ path: "/m/sprint/:sprintId", element: <SprintBoardMobile /> }` alongside other `/m/...` routes under the same guard/AppShell wrapper. Run pass. Commit: `feat(mobile-sprint): register /m/sprint/:sprintId route under AuthGuard`

---

## Task 9 — Make SprintCommitmentCard tappable (entry point)

**Files:** modify `pwa/src/mobile/pages/Dashboard/components/SprintCommitmentCard.tsx` + create `.test.tsx`

### Failing test
```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<typeof import("react-router-dom")>()), useNavigate: () => navigate }));
import { SprintCommitmentCard } from "./SprintCommitmentCard";

const sprint: any = { name: "SP-1", start_date: "2026-05-01", end_date: "2026-05-14", committed_points: 20, done_points: 8, progress_pct: 40, risk: "low" };

describe("SprintCommitmentCard entry point", () => {
  it("navigates to the mobile sprint board on tap", () => {
    render(<MemoryRouter><SprintCommitmentCard sprint={sprint} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId("sprint-commitment-card"));
    expect(navigate).toHaveBeenCalledWith("/m/sprint/SP-1");
  });
});
```
NOTE: adapt the `sprint` prop shape + the real `MeSprint` field used as id. Run → FAIL.

### Implement
Add `useNavigate` + `trackSprintBoardOpen`; on the outer card add `data-testid="sprint-commitment-card"`, `role="button"`, `tabIndex={0}`, `onClick`/`onKeyDown` navigating to `/m/sprint/${sprint.name}`, and `cursor:pointer`. Run pass. Commit: `feat(mobile-sprint): make dashboard sprint card tap into mobile board`

---

## Task 10 — Final verification gate

```
cd pwa && pnpm vitest run
cd pwa && NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit
cd pwa && NODE_OPTIONS=--max-old-space-size=4096 pnpm build
```
If `tsc` rejects the dynamic key `payload[args.axis] = … as never`, narrow explicitly: `if (axis === "kanban_status") payload.kanban_status = targetColumn as KanbanStatus; else payload.pdca_phase = targetColumn as PdcaPhase;`. Commit fixes: `chore(mobile-sprint): verify full suite, tsc, and build pass`

---

## Self-Review — spec section → task mapping

- §1 api.ts → T3; useSprintBoard → T4; SprintBoardMobile → T7; MobileKanbanColumn → T6; MobileTaskCard → T5; reuse portal types/rank → imported throughout; columns → T2.
- §2 columns + axis toggle (default kanban, 80vw snap, horizontal scroll) → T2 + T6 + T7.
- §3 drag move (PointerSensor+TouchSensor, within/across, optimistic+rollback, rebalance, permission→toast) → T7 sensors/`__onDragEndForTest` + T4 optimistic/rollback/rebalance + T7 toast.
- §4 entry point (tappable card → route, guards, back) → T9 + T8 + T7 back button.
- §5 states (skeleton/empty/error+retry/pending/toast) → T7 + T5 pending + T4 rollback.
- §6 telemetry → T1 (events) wired in T7 & T9.
- §7 tests per module + gate → T3–T7,T9,T10.
- §8 out-of-scope (no Python, no outbox, no sprint CRUD, no tap-to-move, no burndown) honored.
