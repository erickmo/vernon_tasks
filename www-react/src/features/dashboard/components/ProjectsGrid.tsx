import { ProjectCard } from './ProjectCard';
import { SectionHead } from '@/components/SectionHead';
import { InboxIcon } from '@/components/icons';
import type { ProjectCardData } from '../types';

export function ProjectsGrid({ projects }: { projects: ProjectCardData[] }) {
  if (projects.length === 0) {
    return (
      <section aria-label="My projects">
        <SectionHead title="My Projects" />
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center">
          <InboxIcon className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">No projects assigned to you.</p>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="My projects">
      <SectionHead
        title="My Projects"
        hint={`${projects.length} active`}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </section>
  );
}
