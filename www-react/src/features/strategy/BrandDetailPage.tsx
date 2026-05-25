import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  STRATEGY_KEY,
  fetchBrandStrategyTree,
  type ObjectiveNode,
  type ProjectNode,
} from './strategyApi';
import { deleteObjective } from './okrApi';
import { ObjectiveFormModal, type ObjectiveFormMode } from './ObjectiveFormModal';
import { getProjectTasks, KEY as PROJECT_KEY } from '@/features/projects/projectsApi';
import type { TaskBucket } from '@/features/projects/types';

const STALE_TIME_MS = 60_000;

function pdcaTone(phase: string): string {
  switch (phase) {
    case 'PLAN':
      return 'bg-slate-100 text-slate-700';
    case 'DO':
      return 'bg-sky-50 text-sky-700';
    case 'CHECK':
      return 'bg-amber-50 text-amber-700';
    case 'ACT':
      return 'bg-violet-50 text-violet-700';
    case 'CLOSED':
      return 'bg-slate-200 text-slate-500';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function statusTone(status: string): string {
  switch (status) {
    case 'On Track':
      return 'bg-emerald-50 text-emerald-700';
    case 'At Risk':
      return 'bg-amber-50 text-amber-700';
    case 'Closed':
      return 'bg-slate-100 text-slate-500';
    default:
      return 'bg-sky-50 text-sky-700';
  }
}

function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={
        'inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium tracking-wide ' +
        tone
      }
    >
      {label}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full bg-brand transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={'h-3.5 w-3.5 transition-transform ' + (open ? 'rotate-90' : '')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function ProjectTasksList({ projectId }: { projectId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: PROJECT_KEY.tasks(projectId, 'kr'),
    queryFn: () => getProjectTasks(projectId, 'kr'),
    staleTime: STALE_TIME_MS,
  });

  if (isLoading)
    return <p className="text-[11px] text-slate-400 px-3 py-2">Loading tasks…</p>;
  if (isError)
    return <p className="text-[11px] text-rose-500 px-3 py-2">Gagal load tasks.</p>;
  if (!data || data.length === 0)
    return <p className="text-[11px] text-slate-400 px-3 py-2">Belum ada task.</p>;

  const flat = data.flatMap((b: TaskBucket) =>
    b.tasks.map((t) => ({ ...t, _bucket: b.label })),
  );

  if (flat.length === 0)
    return <p className="text-[11px] text-slate-400 px-3 py-2">Belum ada task.</p>;

  return (
    <ul className="divide-y divide-slate-100">
      {flat.map((t) => (
        <li
          key={t.id}
          className="flex items-center gap-3 px-3 py-2 text-[12px] hover:bg-slate-50/60"
        >
          <span className="inline-flex items-center h-5 px-1.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
            {t.pdca}
          </span>
          <span className="flex-1 truncate text-slate-800">{t.title}</span>
          <span className="text-[10px] text-slate-500 truncate max-w-[140px]">
            {t._bucket}
          </span>
          <span className="text-[10px] text-slate-500">{t.assignee ?? '—'}</span>
          <span className="text-[10px] text-slate-500 tabular-nums">
            {t.due_date ?? '—'}
          </span>
          <span className="text-[10px] text-slate-700 tabular-nums">{t.points}pt</span>
        </li>
      ))}
    </ul>
  );
}

function ProjectRow({ p }: { p: ProjectNode }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Collapse tasks' : 'Expand tasks'}
          className="text-slate-400 hover:text-slate-700"
        >
          <Chevron open={open} />
        </button>
        <Link
          to={`/portal/projects/${encodeURIComponent(p.name)}`}
          className="flex-1 truncate text-[13px] text-slate-800 hover:text-brand font-medium"
        >
          {p.title}
        </Link>
        <Chip label={p.pdca_phase} tone={pdcaTone(p.pdca_phase)} />
        <Chip label={p.status} tone={statusTone(p.status)} />
        <span className="hidden sm:inline text-[10px] text-slate-500 tabular-nums w-20 text-right">
          {p.end_date ?? '—'}
        </span>
        <span className="w-12 text-right text-[10px] tabular-nums text-slate-500">
          {p.percent_done.toFixed(0)}%
        </span>
      </div>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/40">
          <ProjectTasksList projectId={p.name} />
        </div>
      )}
    </li>
  );
}

function ObjectiveCard({
  obj,
  onEdit,
  onDelete,
}: {
  obj: ObjectiveNode;
  onEdit: (o: ObjectiveNode) => void;
  onDelete: (o: ObjectiveNode) => void;
}) {
  const [open, setOpen] = useState(true);
  const avgKr =
    obj.key_results.length === 0
      ? 0
      : obj.key_results.reduce((s, k) => s + (k.progress_percent || 0), 0) /
        obj.key_results.length;

  return (
    <article className="rounded-xl border border-slate-200 bg-white">
      <header
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/60"
        onClick={() => setOpen((o) => !o)}
      >
        <Chevron open={open} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{obj.title}</h3>
            <span className="text-[10px] text-slate-400">{obj.period}</span>
            {obj.period_end && (
              <span className="text-[10px] text-slate-400 tabular-nums">
                · due {obj.period_end}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Chip label={obj.pdca_phase} tone={pdcaTone(obj.pdca_phase)} />
            <Chip label={obj.status} tone={statusTone(obj.status)} />
            <span className="text-[11px] text-slate-500">
              {obj.key_results.length} KR · {obj.kpi_definitions.length} KPI ·{' '}
              {obj.projects.length} project
            </span>
          </div>
        </div>
        <div className="w-28 hidden sm:block">
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
            <span>Progress</span>
            <span className="tabular-nums font-medium text-slate-700">
              {avgKr.toFixed(0)}%
            </span>
          </div>
          <ProgressBar pct={avgKr} />
        </div>
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onEdit(obj)}
            className="btn-ghost btn-sm text-[11px]"
            aria-label="Edit objective"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(obj)}
            className="btn-ghost btn-sm text-[11px] text-rose-600 hover:bg-rose-50"
            aria-label="Delete objective"
          >
            Delete
          </button>
        </div>
      </header>

      {open && (
        <div className="px-4 pb-4 pt-2 space-y-4 border-t border-slate-100">
          {obj.key_results.length > 0 && (
            <section>
              <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                Key Results
              </h4>
              <ul className="space-y-1.5">
                {obj.key_results.map((kr) => (
                  <li
                    key={kr.name}
                    className="grid grid-cols-[1fr_auto] gap-3 items-center text-xs"
                  >
                    <div>
                      <div className="text-slate-800 font-medium">{kr.metric}</div>
                      <div className="text-[10px] text-slate-400 tabular-nums">
                        {kr.current_value} / {kr.target_value} {kr.unit ?? ''}
                      </div>
                    </div>
                    <div className="w-28">
                      <div className="text-right text-[10px] text-slate-600 tabular-nums mb-1">
                        {kr.progress_percent.toFixed(0)}%
                      </div>
                      <ProgressBar pct={kr.progress_percent} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
              Projects {obj.projects.length > 0 && (
                <span className="text-slate-400">({obj.projects.length})</span>
              )}
            </h4>
            {obj.projects.length === 0 ? (
              <p className="text-[11px] text-slate-400">Belum ada project terkait.</p>
            ) : (
              <ul className="space-y-2">
                {obj.projects.map((p) => (
                  <ProjectRow key={p.name} p={p} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </article>
  );
}

export function BrandDetailPage() {
  const { brand } = useParams<{ brand: string }>();
  const brandId = brand ? decodeURIComponent(brand) : '';
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: STRATEGY_KEY(brandId),
    queryFn: () => fetchBrandStrategyTree(brandId),
    staleTime: STALE_TIME_MS,
    enabled: !!brandId,
  });

  const node = data?.[0];

  const [modalMode, setModalMode] = useState<ObjectiveFormMode | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const delMutation = useMutation({
    mutationFn: (id: string) => deleteObjective(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand-strategy'] });
    },
    onError: (err: any) => {
      setDeleteError(
        String(
          err?.response?.data?.exception ||
            err?.response?.data?.message ||
            err?.message ||
            'Gagal menghapus objective.',
        ),
      );
    },
  });

  function handleEdit(o: ObjectiveNode) {
    setModalMode({
      kind: 'edit',
      id: o.name,
      initial: {
        title: o.title,
        brand: brandId,
        period: o.period,
        period_start: o.period_start ?? '',
        period_end: o.period_end ?? '',
        objective_owner: o.objective_owner,
        status: o.status,
        pdca_phase: o.pdca_phase,
        description: o.description ?? '',
      },
    });
  }

  function handleDelete(o: ObjectiveNode) {
    setDeleteError(null);
    if (!window.confirm(`Hapus objective "${o.title}"? Tindakan tidak bisa di-undo.`)) {
      return;
    }
    delMutation.mutate(o.name);
  }

  return (
    <div className="space-y-6">
      <nav className="text-xs text-slate-500">
        <Link to="/portal/strategy" className="hover:text-brand">
          Strategy
        </Link>{' '}
        <span className="text-slate-300">/</span>{' '}
        <span className="text-slate-700 font-medium">
          {node?.brand_name ?? brandId}
        </span>
      </nav>

      {isLoading && (
        <div className="card h-32 animate-pulse" />
      )}
      {isError && (
        <div className="card border-rose-100 bg-rose-50/60 px-5 py-4 text-sm text-rose-700">
          <span className="font-semibold">Gagal memuat brand.</span> {String(error)}
        </div>
      )}
      {!isLoading && !isError && !node && (
        <div className="card px-5 py-10 text-center text-sm text-slate-500">
          Brand tidak ditemukan.
        </div>
      )}

      {node && (
        <>
          <header className="card flex items-center gap-4 px-5 py-4">
            {node.logo ? (
              <img
                src={node.logo}
                alt={node.brand_name}
                className="h-14 w-14 rounded-lg object-cover bg-slate-100"
              />
            ) : (
              <div className="h-14 w-14 rounded-lg bg-brand-subtle text-brand flex items-center justify-center text-base font-bold">
                {node.brand_name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 truncate">
                {node.brand_name}
              </h1>
              {node.description && (
                <p className="text-[12px] text-slate-500 truncate mt-0.5">
                  {node.description}
                </p>
              )}
              <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
                <span>
                  <strong className="text-slate-800">{node.objective_count}</strong>{' '}
                  objectives
                </span>
                <span>
                  <strong className="text-slate-800">{node.project_count}</strong>{' '}
                  projects
                </span>
              </div>
            </div>
          </header>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Objectives ({node.objectives.length})
              </h2>
              <button
                type="button"
                onClick={() => setModalMode({ kind: 'create', brand: brandId })}
                className="btn-primary btn-sm text-[11px]"
              >
                + New Objective
              </button>
            </div>
            {deleteError && (
              <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {deleteError}
              </div>
            )}
            {node.objectives.length === 0 ? (
              <div className="card px-5 py-8 text-center text-sm text-slate-500">
                Belum ada Objective untuk brand ini.
              </div>
            ) : (
              node.objectives.map((o) => (
                <ObjectiveCard
                  key={o.name}
                  obj={o}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))
            )}
          </section>

          {node.unlinked_projects.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Projects tanpa Objective ({node.unlinked_projects.length})
              </h2>
              <ul className="space-y-2">
                {node.unlinked_projects.map((p) => (
                  <ProjectRow key={p.name} p={p} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <ObjectiveFormModal
        open={modalMode !== null}
        mode={modalMode}
        onClose={() => setModalMode(null)}
      />
    </div>
  );
}
