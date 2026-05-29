import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProjectFormModal } from "./ProjectFormModal";

describe("ProjectFormModal", () => {
  it("renders create title and disables save when empty", () => {
    render(<ProjectFormModal mode="create" onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Buat Proyek")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });
  it("calls onSave with trimmed title and status", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProjectFormModal mode="create" onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Gamma  " } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ title: "Gamma", status: "Open" }));
  });
  it("calls onCancel when Batal clicked", () => {
    const onCancel = vi.fn();
    render(<ProjectFormModal mode="create" onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
