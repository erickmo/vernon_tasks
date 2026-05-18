import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { OverdueTable } from "./OverdueTable";
import type { OverdueResponse } from "../api/types";

const DATA: OverdueResponse = {
  as_of: "2026-05-18",
  total_overdue: 5,
  by_member: [
    { user: "alice@x.com", full_name: "Alice", overdue_count: 3,
      overdue_hours: 11.5, oldest_overdue_days: 9 },
  ],
  by_project: [
    { project: "P1", project_title: "Alpha", overdue_count: 3, overdue_hours: 11.5 },
  ],
};

describe("OverdueTable", () => {
  it("by member view shows member name by default", () => {
    render(createElement(OverdueTable, { data: DATA }));
    expect(screen.getByText("Alice")).not.toBeNull();
  });

  it("toggle to by project shows project title", () => {
    render(createElement(OverdueTable, { data: DATA }));
    const btn = screen.getByRole("button", { name: /by project/i });
    fireEvent.click(btn);
    expect(screen.getByText("Alpha")).not.toBeNull();
  });

  it("row with oldest_overdue_days > 7 has red-text class", () => {
    const { container } = render(createElement(OverdueTable, { data: DATA }));
    expect(container.querySelector(".overdue-row--red")).not.toBeNull();
  });
});
