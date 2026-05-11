import { jsx as _jsx } from "react/jsx-runtime";
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EmptyState } from "./EmptyState";
import { OfflineBanner } from "./OfflineBanner";
import { StaleBadge } from "./StaleBadge";
import { BottomNav } from "./BottomNav";
import { stamp } from "../cache/sync-time";
describe("components", () => {
    it("EmptyState renders title + cta", () => {
        render(_jsx(EmptyState, { title: "Kosong", cta: { label: "Coba", onClick: () => { } } }));
        expect(screen.getByText("Kosong")).toBeInTheDocument();
        expect(screen.getByText("Coba")).toBeInTheDocument();
    });
    it("OfflineBanner shows when offline", () => {
        Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
        render(_jsx(OfflineBanner, {}));
        act(() => {
            window.dispatchEvent(new Event("offline"));
        });
        expect(screen.getByText(/offline/i)).toBeInTheDocument();
    });
    it("StaleBadge prints relative time", () => {
        stamp("my-work");
        render(_jsx(StaleBadge, { resource: "my-work" }));
        expect(screen.getByText(/baru saja/i)).toBeInTheDocument();
    });
    it("BottomNav highlights active route", () => {
        render(_jsx(MemoryRouter, { initialEntries: ["/m/work"], children: _jsx(BottomNav, {}) }));
        const tasks = screen.getByText("Tugas").closest("a");
        expect(tasks).toHaveAttribute("aria-current", "page");
    });
});
