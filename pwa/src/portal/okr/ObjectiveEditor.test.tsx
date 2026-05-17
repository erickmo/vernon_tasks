import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ObjectiveEditor } from "./ObjectiveEditor";
import * as objApi from "./api/objectives";

function wrap(initial = "/portal/okr/new") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/portal/okr/new" element={<ObjectiveEditor mode="create" />} />
          <Route path="/portal/okr" element={<div data-testid="list-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ObjectiveEditor (create)", () => {
  it("validates required title", async () => {
    wrap();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByText(/title is required/i)).toBeInTheDocument());
  });

  it("auto-fills period dates from period string on blur", async () => {
    wrap();
    const period = screen.getByLabelText(/^period$/i);
    fireEvent.change(period, { target: { value: "2026-Q2" } });
    fireEvent.blur(period);
    await waitFor(() => expect((screen.getByLabelText(/period start/i) as HTMLInputElement).value).toBe("2026-04-01"));
    expect((screen.getByLabelText(/period end/i) as HTMLInputElement).value).toBe("2026-06-30");
  });

  it("submits create and redirects to list", async () => {
    vi.spyOn(objApi, "createObjective").mockResolvedValue({ data: { name: "OBJ-NEW" } } as never);
    wrap();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "T" } });
    const period = screen.getByLabelText(/^period$/i);
    fireEvent.change(period, { target: { value: "2026-Q2" } });
    fireEvent.blur(period);
    fireEvent.change(screen.getByLabelText(/owner/i), { target: { value: "Administrator" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(screen.getByTestId("list-page")).toBeInTheDocument());
  });
});
