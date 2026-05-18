import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { SprintEditor } from "./SprintEditor";

vi.mock("./api/sprints", () => ({
  createSprint: vi.fn(async () => ({ name: "SP-NEW" })),
  updateSprint: vi.fn(async () => ({ name: "SP-1" })),
  getSprintWithRelations: vi.fn(),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("SprintEditor (create)", () => {
  it("submits create with form values", async () => {
    const onSaved = vi.fn();
    wrap(<SprintEditor mode="create" projectId="PR-1" onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/sprint title/i), { target: { value: "S new" } });
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: "2026-06-14" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("SP-NEW"));
  });
});
