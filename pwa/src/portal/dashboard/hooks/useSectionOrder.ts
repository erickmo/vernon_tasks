export type SectionId = "leader" | "owner" | "member";
const KEY = "vt_dashboard_section_order";
const DEFAULT: SectionId[] = ["leader", "owner", "member"];

export function getSectionOrder(): SectionId[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x: unknown) => DEFAULT.includes(x as SectionId))) {
      return parsed as SectionId[];
    }
  } catch { /* ignore */ }
  return [...DEFAULT];
}

export function saveSectionOrder(order: SectionId[]): void {
  localStorage.setItem(KEY, JSON.stringify(order));
}
