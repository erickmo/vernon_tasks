import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { VelocityStrip } from "./VelocityStrip";

const weeks = Array.from({ length: 8 }, (_, i) => ({ week: `W${i}`, done: i }));

describe("VelocityStrip", () => {
  it("renders last week value as headline", () => {
    render(<VelocityStrip weeks={weeks} delta={2} />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("shows up arrow + abs delta when positive", () => {
    render(<VelocityStrip weeks={weeks} delta={3} />);
    expect(screen.getByText(/↑ 3 vs lalu/)).toBeInTheDocument();
  });

  it("shows down arrow + abs delta when negative", () => {
    render(<VelocityStrip weeks={weeks} delta={-2} />);
    expect(screen.getByText(/↓ 2 vs lalu/)).toBeInTheDocument();
  });

  it("shows neutral dot when delta is zero", () => {
    render(<VelocityStrip weeks={weeks} delta={0} />);
    expect(screen.getByText(/· 0 vs lalu/)).toBeInTheDocument();
  });

  it("renders 0 headline when all weeks are zero", () => {
    const zero = weeks.map((w) => ({ ...w, done: 0 }));
    render(<VelocityStrip weeks={zero} delta={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
