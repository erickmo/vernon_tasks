import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReloginModal } from "./ReloginModal";

vi.mock("../auth/session", () => ({
  login: vi.fn().mockResolvedValue({ user: "test@example.com" }),
}));

describe("ReloginModal", () => {
  it("renders heading and password field when open", () => {
    render(<ReloginModal open onResolve={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /sesi berakhir/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("")).toBeInTheDocument(); // password input
  });

  it("does not render when closed", () => {
    render(<ReloginModal open={false} onResolve={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: /sesi berakhir/i })).not.toBeInTheDocument();
  });
});
