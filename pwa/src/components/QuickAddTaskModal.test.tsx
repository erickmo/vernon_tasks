import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuickAddTaskModal } from "./QuickAddTaskModal";

const createTask = vi.fn().mockResolvedValue({});
vi.mock("../mobile/pages/Project/api", () => ({ createTask: (...a: unknown[]) => createTask(...a) }));

const enqueueMock = vi.fn().mockResolvedValue({ id: "x" });
vi.mock("../cache/outbox", () => ({ enqueue: (...a: unknown[]) => enqueueMock(...a) }));
let online = true;
vi.mock("../hooks/useOnline", () => ({ useOnline: () => online }));

const projects = [
  { name: "PROJ-001", title: "Alpha" },
  { name: "PROJ-002", title: "Beta" },
];

describe("QuickAddTaskModal", () => {
  beforeEach(() => { vi.clearAllMocks(); online = true; });

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

  it("enqueues create_task instead of calling API when offline", async () => {
    online = false;
    const onCreated = vi.fn();
    render(<QuickAddTaskModal projects={projects} onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText(/proyek/i), { target: { value: "PROJ-001" } });
    fireEvent.change(screen.getByLabelText(/judul/i), { target: { value: "Tugas Z" } });
    fireEvent.click(screen.getByRole("button", { name: "Tambah" }));
    await waitFor(() => expect(enqueueMock).toHaveBeenCalledWith("create_task", { project: "PROJ-001", title: "Tugas Z" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(createTask).not.toHaveBeenCalled();
  });
});
