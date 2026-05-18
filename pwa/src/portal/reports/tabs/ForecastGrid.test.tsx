import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { ForecastGrid } from "./ForecastGrid";
import type { ForecastItem } from "../api/types";

const ITEMS: ForecastItem[] = [
  { project: "P1", project_title: "Alpha", completion_estimate: "2026-07-04",
    confidence: 0.72, remaining_points: 186, avg_velocity: 41.2, status: "on_track" },
  { project: "P2", project_title: "Beta", completion_estimate: "2026-05-01",
    confidence: 0.50, remaining_points: 80, avg_velocity: 20.0, status: "delayed" },
];

describe("ForecastGrid", () => {
  it("renders project title", () => {
    render(createElement(ForecastGrid, { forecasts: ITEMS }));
    expect(screen.getByText("Alpha")).not.toBeNull();
  });

  it("on_track status card has green class", () => {
    const { container } = render(createElement(ForecastGrid, { forecasts: ITEMS }));
    expect(container.querySelector(".forecast-card--on-track")).not.toBeNull();
  });

  it("delayed status card has red class", () => {
    const { container } = render(createElement(ForecastGrid, { forecasts: ITEMS }));
    expect(container.querySelector(".forecast-card--delayed")).not.toBeNull();
  });
});
