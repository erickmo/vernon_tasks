import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { AgendaDayGroup } from "./AgendaDayGroup";
import type { AgendaDay, AgendaItem } from "../../../../api/dashboard";

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const meeting: AgendaItem = {
  type: "meeting",
  id: "M1",
  title: "Standup",
  project: "Vernon",
  date: "2026-05-29",
  time: "09:30",
  priority: null,
  route: "/m/meeting/M1",
};

const task: AgendaItem = {
  type: "task",
  id: "T1",
  title: "Ship PR",
  project: null,
  date: "2026-05-29",
  time: null,
  priority: "High",
  route: "/m/work/T1",
};

const day: AgendaDay = { date: "2026-05-29", label: "Today", items: [meeting, task] };

describe("AgendaDayGroup", () => {
  it("renders label and items", () => {
    wrap(<AgendaDayGroup day={day} />);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Standup")).toBeInTheDocument();
    expect(screen.getByText("Ship PR")).toBeInTheDocument();
  });

  it("renders time when present, EOD fallback for task", () => {
    wrap(<AgendaDayGroup day={day} />);
    expect(screen.getByText("09:30")).toBeInTheDocument();
    expect(screen.getByText("EOD")).toBeInTheDocument();
  });

  it("falls back to em dash for non-task without time", () => {
    const noTimeMeeting: AgendaItem = { ...meeting, time: null };
    wrap(<AgendaDayGroup day={{ ...day, items: [noTimeMeeting] }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("uses route as link href", () => {
    wrap(<AgendaDayGroup day={day} />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/m/meeting/M1");
    expect(links[1]).toHaveAttribute("href", "/m/work/T1");
  });

  it("renders fallback dot icon for unknown type", () => {
    const weird = { ...meeting, type: "unknown" as unknown as AgendaItem["type"] };
    wrap(<AgendaDayGroup day={{ ...day, items: [weird] }} />);
    expect(screen.getByText("·")).toBeInTheDocument();
  });
});
