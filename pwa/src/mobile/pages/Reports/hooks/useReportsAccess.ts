import { useManagedProjects } from "./useManagedProjects";

export interface ReportsAccess {
  canMyReports: boolean;
  canProjects: boolean;
  canTeam: boolean;
  isLoading: boolean;
}

/** Derives card visibility on /m/reports landing from role + managed projects.
 *  - canMyReports: always true (every user has personal performance).
 *  - canProjects:  true iff user manages ≥1 project (Leader+).
 *  - canTeam:      true iff user manages ≥1 project (team = union of members).
 */
export function useReportsAccess(): ReportsAccess {
  const { projects, isLoading } = useManagedProjects();
  const hasProjects = projects.length > 0;
  return {
    canMyReports: true,
    canProjects: hasProjects,
    canTeam: hasProjects,
    isLoading,
  };
}
