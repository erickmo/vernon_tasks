import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { HealthScoreCard } from "./HealthScoreCard";

const BASE_PROPS = {
  score: 82,
  okr_pct: 0.74,
  ontime_pct: 0.88,
  velocity_health: 0.91,
  components: { okr_weight: 0.4, ontime_weight: 0.3, velocity_weight: 0.3 },
  as_of: "2026-05-18T10:00:00",
};

describe("HealthScoreCard", () => {
  it("score >= 80 renders green class", () => {
    const { container } = render(createElement(HealthScoreCard, { ...BASE_PROPS, score: 82 }));
    expect(container.querySelector(".health-score--green")).not.toBeNull();
  });

  it("score 60-79 renders amber class", () => {
    const { container } = render(createElement(HealthScoreCard, { ...BASE_PROPS, score: 70 }));
    expect(container.querySelector(".health-score--amber")).not.toBeNull();
  });

  it("score < 60 renders red class", () => {
    const { container } = render(createElement(HealthScoreCard, { ...BASE_PROPS, score: 45 }));
    expect(container.querySelector(".health-score--red")).not.toBeNull();
  });

  it("has aria-label with score value", () => {
    render(createElement(HealthScoreCard, { ...BASE_PROPS, score: 82 }));
    expect(screen.getByLabelText(/health score: 82/i)).not.toBeNull();
  });
});
