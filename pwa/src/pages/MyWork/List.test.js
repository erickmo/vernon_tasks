import { jsx as _jsx } from "react/jsx-runtime";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyWorkList } from "./List";
function wrap(ui) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(_jsx(QueryClientProvider, { client: qc, children: _jsx(MemoryRouter, { children: ui }) }));
}
describe("MyWorkList", () => {
    it("renders task title from API", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
            message: { overdue: [], today: [{ id: "T1", title: "Buat laporan" }], upcoming: [] },
        }), { status: 200 })));
        wrap(_jsx(MyWorkList, {}));
        await waitFor(() => expect(screen.getByText("Buat laporan")).toBeInTheDocument());
    });
    it("shows empty state when no tasks", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: { overdue: [], today: [], upcoming: [] } }), { status: 200 })));
        wrap(_jsx(MyWorkList, {}));
        await waitFor(() => expect(screen.getByText(/Nikmati waktumu/i)).toBeInTheDocument());
    });
});
