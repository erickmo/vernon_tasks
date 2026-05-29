export const BREADCRUMB_MAP: { prefix: string; label: string }[] = [
  { prefix: "/m/dashboard", label: "Dashboard" },
  { prefix: "/m/project",   label: "Project" },
  { prefix: "/m/work",      label: "Project" },
  { prefix: "/m/analytics", label: "Analytics" },
  { prefix: "/m/leader",    label: "Leader" },
  { prefix: "/m/me",        label: "Me" },
];

export function getBreadcrumb(pathname: string): string {
  const match = BREADCRUMB_MAP.find((r) => pathname.startsWith(r.prefix));
  return match?.label ?? "Vernon";
}

export const NAV2_ITEMS = [
  { label: "Dashboard", to: "/m/dashboard" },
  { label: "Project",   to: "/m/project" },
  { label: "Report",    to: "/m/analytics" },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────────
export function getInitials(username: string | null): string {
  if (!username) return "?";
  const local = username.split("@")[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}
