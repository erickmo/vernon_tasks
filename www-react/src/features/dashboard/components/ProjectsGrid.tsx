import { ProjectCard } from './ProjectCard';
import type { ProjectCardData } from '../types';

export function ProjectsGrid({ projects }: { projects: ProjectCardData[] }) {
  if (projects.length === 0) {
    return <p className="text-sm text-slate-500">No projects assigned to you.</p>;
  }
  return (
    <section aria-label="My projects">
      <h2 className="text-sm font-semibold mb-3">My Projects</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </section>
  );
}
