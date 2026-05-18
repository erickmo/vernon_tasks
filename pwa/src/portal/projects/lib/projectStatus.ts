export const PROJECT_STATUSES = ["Open", "On Track", "At Risk", "Closed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isTerminalStatus(s: string): boolean {
  return s === "Closed";
}
