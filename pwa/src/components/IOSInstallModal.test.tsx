import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IOSInstallModal } from "./IOSInstallModal";

describe("IOSInstallModal", () => {
  it("renders heading when open", () => {
    render(<IOSInstallModal open onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /tambah ke layar utama/i })).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<IOSInstallModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("heading", { name: /tambah ke layar utama/i })).not.toBeInTheDocument();
  });
});
