export interface NavItem {
  key: string;
  label: string;
  path: string;
  permission: string | null;
}

export const portalNav: NavItem[] = [
  { key: "dashboard", label: "Dashboard", path: "/portal",           permission: null },
  { key: "okr",       label: "OKR",       path: "/portal/okr",       permission: "okr.read" },
  { key: "projects",  label: "Projects",  path: "/portal/projects",  permission: "project.read" },
  { key: "workforce", label: "Workforce", path: "/portal/workforce", permission: "workforce.read" },
  { key: "reports",   label: "Reports",   path: "/portal/reports",   permission: "report.read" },
];

export function filterNavByPermissions(
  items: NavItem[],
  hasPermission: (perm: string) => boolean,
): NavItem[] {
  return items.filter((it) => it.permission === null || hasPermission(it.permission));
}
