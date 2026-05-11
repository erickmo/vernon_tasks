import { describe, it, expect } from "vitest";
import { t, fmtDate, fmtTime, greeting } from "./i18n";
describe("i18n", () => {
    it("translates keys", () => {
        expect(t("login.submit")).toBe("Masuk");
        expect(t("nav.tasks")).toBe("Tugas");
    });
    it("returns key when missing", () => {
        expect(t("does.not.exist")).toBe("does.not.exist");
    });
    it("formats date as DD MMM YYYY id-ID", () => {
        const d = new Date("2026-05-11T12:00:00Z");
        expect(fmtDate(d)).toMatch(/11 Mei 2026/);
    });
    it("formats time 24h", () => {
        const d = new Date("2026-05-11T14:32:00Z");
        expect(fmtTime(d)).toMatch(/\d{2}[.:]\d{2}/);
    });
    it("greets by hour", () => {
        expect(greeting(7)).toBe("Selamat pagi");
        expect(greeting(13)).toBe("Selamat siang");
        expect(greeting(16)).toBe("Selamat sore");
        expect(greeting(21)).toBe("Selamat malam");
    });
});
