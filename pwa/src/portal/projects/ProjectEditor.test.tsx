import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProjectEditor } from "./ProjectEditor";
import * as projApi from "./api/projects";

function wrap(initial = "/portal/projects/new") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/portal/projects/new" element={<ProjectEditor mode="create" />} />
          <Route path="/portal/projects" element={<div data-testid="list-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectEditor (create)", () => {
  it("validates required title", async () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByText(/title is required/i)).toBeInTheDocument());
  });

  it("validates start ≤ end", async () => {
    wrap();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText(/leader/i), { target: { value: "Administrator" } });
    fireEvent.change(screen.getByLabelText(/owner/i), { target: { value: "Administrator" } });
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: "2026-06-30" } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: "2026-04-01" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByText(/start must be/i)).toBeInTheDocument());
  });

  it("submits create + navigates", async () => {
    vi.spyOn(projApi, "createProject").mockResolvedValue({ data: { name: "PROJ-NEW" } } as any);
    wrap();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText(/leader/i), { target: { value: "Administrator" } });
    fireEvent.change(screen.getByLabelText(/owner/i), { target: { value: "Administrator" } });
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: "2026-04-01" } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: "2026-06-30" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByTestId("list-page")).toBeInTheDocument());
  });
});
