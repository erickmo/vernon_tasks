import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { OKRRoutes } from "./OKRRoutes";
import * as objApi from "./api/objectives";

function wrap(initial: string) {
  vi.spyOn(objApi, "listObjectives").mockResolvedValue([]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/portal/okr/*" element={<OKRRoutes />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("OKRRoutes", () => {
  it("/portal/okr renders OKRList heading", async () => {
    wrap("/portal/okr");
    await waitFor(() => expect(screen.getByRole("heading", { name: /^OKR$/ })).toBeInTheDocument());
  });

  it("/portal/okr/new renders editor heading", async () => {
    wrap("/portal/okr/new");
    await waitFor(() => expect(screen.getByRole("heading", { name: /new objective/i })).toBeInTheDocument());
  });
});
