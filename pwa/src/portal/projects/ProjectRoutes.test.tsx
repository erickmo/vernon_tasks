import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProjectRoutes } from "./ProjectRoutes";
import * as projApi from "./api/projects";

function wrap(initial: string) {
  vi.spyOn(projApi, "listProjects").mockResolvedValue([]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/portal/projects/*" element={<ProjectRoutes />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectRoutes", () => {
  it("/portal/projects renders ProjectList heading", async () => {
    wrap("/portal/projects");
    await waitFor(() => expect(screen.getByRole("heading", { name: /^Projects$/ })).toBeInTheDocument());
  });

  it("/portal/projects/new renders editor heading", async () => {
    wrap("/portal/projects/new");
    await waitFor(() => expect(screen.getByRole("heading", { name: /new project/i })).toBeInTheDocument());
  });
});
