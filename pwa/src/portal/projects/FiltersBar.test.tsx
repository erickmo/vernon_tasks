import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route, useSearchParams } from "react-router-dom";
import { FiltersBar } from "./FiltersBar";

function Probe() {
  const [params] = useSearchParams();
  return <span data-testid="probe">{params.toString()}</span>;
}

function renderWithRouter(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes><Route path="*" element={<><FiltersBar /><Probe /></>} /></Routes>
    </MemoryRouter>,
  );
}

describe("Projects FiltersBar", () => {
  it("renders inputs + chips + leader field", () => {
    renderWithRouter("/portal/projects");
    expect(screen.getByLabelText(/period start/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/period end/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/leader/i)).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("At Risk")).toBeInTheDocument();
    expect(screen.getByText("PLAN")).toBeInTheDocument();
  });

  it("toggling status updates URL", () => {
    renderWithRouter("/portal/projects");
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByTestId("probe").textContent).toContain("statuses=Open");
  });

  it("clears filters", () => {
    renderWithRouter("/portal/projects?statuses=Open&pdca=PLAN&leader=u1");
    fireEvent.click(screen.getByText(/clear/i));
    expect(screen.getByTestId("probe").textContent).toBe("");
  });
});
