import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  STRATEGY_KEY,
  fetchBrandStrategyTree,
  type BrandStrategyNode,
  type ObjectiveNode,
  type KeyResultNode,
  type KpiDefinitionNode,
} from './strategyApi';
import {
  deleteObjective,
  deleteKeyResult,
  deleteKpiDefinition,
} from './okrApi';
import {
  ObjectiveFormModal,
  type ObjectiveFormMode,
} from './ObjectiveFormModal';
import {
  KeyResultFormModal,
  type KeyResultFormMode,
} from './KeyResultFormModal';
import {
  KpiDefinitionFormModal,
  type KpiDefinitionFormMode,
} from './KpiDefinitionFormModal';
import {
  BrandFormModal,
  type BrandFormMode,
} from '../brands/BrandFormModal';
import { deleteBrand } from '../brands/brandsApi';

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

function Chip({
  label,
  tone = 'bg-slate-100 text-slate-700',
}: {
  label: string;
  tone?: string;
}) {
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
      <div
        className="h-full bg-brand transition-all"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

type StrategyActions = {
  onEditObjective: (obj: ObjectiveNode) => void;
  onDeleteObjective: (id: string) => void;
  onCreateKr: (objectiveId: string) => void;
  onEditKr: (kr: KeyResultNode) => void;
  onDeleteKr: (id: string) => void;
  onCreateKpi: (brand: string, objectiveId?: string) => void;
  onEditKpi: (kpi: KpiDefinitionNode, brand: string) => void;
  onDeleteKpi: (id: string) => void;
  onCreateObjective: (brand: string) => void;
  onEditBrand: (node: BrandStrategyNode) => void;
  onDeleteBrand: (node: BrandStrategyNode) => void;
};

function IconBtn({
  label,
  onClick,
  variant = 'default',
  size = 'sm',
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  variant?: 'default' | 'danger';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}) {
  const sizeCls = size === 'md' ? 'h-9 w-9' : 'h-6 w-6';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={
        'inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 ' +
        sizeCls + ' ' +
        (variant === 'danger' ? 'hover:text-rose-600' : 'hover:text-slate-700')
      }
    >
      {children}
    </button>
  );
}

function PencilIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function TrashIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

function ObjectiveBlock({ obj, brand, actions }: { obj: ObjectiveNode; brand: string; actions: StrategyActions }) {
  const [open, setOpen] = useState(false);
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
        <button
          className="text-slate-400 hover:text-slate-700"
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <svg
            className={
              'h-3.5 w-3.5 transition-transform ' + (open ? 'rotate-90' : '')
            }
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-900 truncate">
              {obj.title}
            </h4>
            <span className="text-[10px] text-slate-400">{obj.period}</span>
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
        <div className="w-24 hidden sm:block">
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
            <span>Progress</span>
            <span className="tabular-nums font-medium text-slate-700">
              {avgKr.toFixed(0)}%
            </span>
          </div>
          <ProgressBar pct={avgKr} />
        </div>
        <div className="flex items-center gap-0.5">
          <IconBtn label="Edit objective" onClick={() => actions.onEditObjective(obj)}>
            <PencilIcon />
          </IconBtn>
          <IconBtn
            label="Delete objective"
            variant="danger"
            onClick={() => actions.onDeleteObjective(obj.name)}
          >
            <TrashIcon />
          </IconBtn>
        </div>
      </header>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-100">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Key Results
              </h5>
              <button
                type="button"
                onClick={() => actions.onCreateKr(obj.name)}
                className="btn-ghost text-[11px] h-6 px-2"
              >
                + KR
              </button>
            </div>
            {obj.key_results.length > 0 ? (
              <ul className="space-y-2">
                {obj.key_results.map((kr) => (
                  <li
                    key={kr.name}
                    className="grid grid-cols-[1fr_auto_auto] gap-3 items-center text-xs"
                  >
                    <div>
                      <div className="text-slate-800 font-medium">{kr.metric}</div>
                      <div className="text-[10px] text-slate-400 tabular-nums">
                        {kr.current_value} / {kr.target_value} {kr.unit ?? ''}
                      </div>
                    </div>
                    <div className="w-24">
                      <div className="text-right text-[10px] text-slate-600 tabular-nums mb-1">
                        {kr.progress_percent.toFixed(0)}%
                      </div>
                      <ProgressBar pct={kr.progress_percent} />
                    </div>
                    <div className="flex items-center gap-0.5">
                      <IconBtn label="Edit KR" onClick={() => actions.onEditKr(kr)}>
                        <PencilIcon />
                      </IconBtn>
                      <IconBtn
                        label="Delete KR"
                        variant="danger"
                        onClick={() => actions.onDeleteKr(kr.name)}
                      >
                        <TrashIcon />
                      </IconBtn>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-400">Belum ada KR.</p>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                KPI Definitions
              </h5>
              <button
                type="button"
                onClick={() => actions.onCreateKpi(brand, obj.name)}
                className="btn-ghost text-[11px] h-6 px-2"
              >
                + KPI
              </button>
            </div>
            {obj.kpi_definitions.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {obj.kpi_definitions.map((k) => (
                  <li
                    key={k.name}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 group"
                  >
                    <span className="font-medium">{k.kpi_name}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">{k.frequency}</span>
                    {k.unit && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{k.unit}</span>
                      </>
                    )}
                    <span className="ml-1 hidden group-hover:inline-flex items-center gap-0.5">
                      <IconBtn label="Edit KPI" onClick={() => actions.onEditKpi(k, brand)}>
                        <PencilIcon />
                      </IconBtn>
                      <IconBtn
                        label="Delete KPI"
                        variant="danger"
                        onClick={() => actions.onDeleteKpi(k.name)}
                      >
                        <TrashIcon />
                      </IconBtn>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-400">Belum ada KPI.</p>
            )}
          </section>

          {obj.projects.length > 0 && (
            <section>
              <h5 className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                Linked Projects
              </h5>
              <ul className="space-y-1.5">
                {obj.projects.map((p) => (
                  <li key={p.name}>
                    <Link
                      to={`/portal/projects/${encodeURIComponent(p.name)}`}
                      className="group flex items-center gap-3 text-xs rounded-md px-2 py-1.5 hover:bg-slate-50"
                    >
                      <span className="flex-1 truncate text-slate-800 group-hover:text-brand">
                        {p.title}
                      </span>
                      <Chip label={p.pdca_phase} tone={pdcaTone(p.pdca_phase)} />
                      <Chip label={p.status} tone={statusTone(p.status)} />
                      <span className="w-12 text-right text-[10px] tabular-nums text-slate-500">
                        {p.percent_done.toFixed(0)}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

        </div>
      )}
    </article>
  );
}

const MAX_ACTIVE_OBJECTIVES = 5;

function Stat({ label, value, tone = 'text-slate-900' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
      <div className={'text-base font-semibold tabular-nums ' + tone}>{value}</div>
    </div>
  );
}

function BrandBlock({ node, actions }: { node: BrandStrategyNode; actions: StrategyActions }) {
  const activeObjectives = useMemo(
    () => node.objectives.filter((o) => o.status !== 'Closed'),
    [node.objectives],
  );
  const visibleObjectives = activeObjectives.slice(0, MAX_ACTIVE_OBJECTIVES);
  const hiddenCount = activeObjectives.length - visibleObjectives.length;

  const totals = useMemo(() => {
    let kr = 0;
    let kpi = 0;
    let progressSum = 0;
    let progressCount = 0;
    for (const o of node.objectives) {
      kr += o.key_results.length;
      kpi += o.kpi_definitions.length;
      if (o.status !== 'Closed') {
        for (const k of o.key_results) {
          progressSum += k.progress_percent || 0;
          progressCount += 1;
        }
      }
    }
    return {
      kr,
      kpi,
      avgProgress: progressCount === 0 ? 0 : progressSum / progressCount,
    };
  }, [node.objectives]);

  return (
    <section className="card overflow-hidden flex flex-col h-full">
      <header className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <Link
          to={`/portal/strategy/${encodeURIComponent(node.brand)}`}
          className="flex items-center gap-3 flex-1 min-w-0 group"
          title="Buka detail brand"
        >
          {node.logo ? (
            <img
              src={node.logo}
              alt={node.brand_name}
              className="h-11 w-11 rounded-lg object-cover bg-slate-100"
            />
          ) : (
            <div className="h-11 w-11 rounded-lg bg-brand-subtle text-brand flex items-center justify-center text-sm font-bold">
              {node.brand_name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate group-hover:text-brand">
              {node.brand_name}
            </h3>
            {node.description && (
              <p className="text-[11px] text-slate-500 truncate mt-0.5">{node.description}</p>
            )}
          </div>
        </Link>
        <div className="flex items-center gap-1">
          <IconBtn label="Edit brand" size="md" onClick={() => actions.onEditBrand(node)}>
            <PencilIcon className="h-5 w-5" />
          </IconBtn>
          <IconBtn
            label="Delete brand"
            size="md"
            variant="danger"
            onClick={() => actions.onDeleteBrand(node)}
          >
            <TrashIcon className="h-5 w-5" />
          </IconBtn>
          <button
            type="button"
            onClick={() => actions.onCreateObjective(node.brand)}
            className="btn-primary btn-sm text-[11px]"
          >
            + Objective
          </button>
        </div>
      </header>

      <div className="px-5 py-4 border-b border-slate-100">
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Objectives" value={node.objective_count} />
          <Stat label="KR" value={totals.kr} />
          <Stat label="KPI" value={totals.kpi} />
          <Stat label="Projects" value={node.project_count} />
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
            <span className="uppercase tracking-wider font-medium">Avg KR Progress (active)</span>
            <span className="tabular-nums font-semibold text-slate-700">
              {totals.avgProgress.toFixed(0)}%
            </span>
          </div>
          <ProgressBar pct={totals.avgProgress} />
        </div>
      </div>

      <div className="px-5 py-4 space-y-3 bg-slate-50/30 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            Active Objectives{' '}
            <span className="text-slate-400">
              ({activeObjectives.length})
            </span>
          </span>
          <button
            type="button"
            onClick={() => actions.onCreateKpi(node.brand)}
            className="btn-ghost btn-sm text-[11px]"
          >
            + KPI
          </button>
        </div>

        {activeObjectives.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">
            Belum ada Objective aktif.
          </p>
        ) : (
          <>
            {visibleObjectives.map((o) => (
              <ObjectiveBlock key={o.name} obj={o} brand={node.brand} actions={actions} />
            ))}
            {hiddenCount > 0 && (
              <p className="text-[11px] text-slate-500 text-center pt-1">
                +{hiddenCount} objective lagi — buka brand detail untuk lihat semua.
              </p>
            )}
          </>
        )}

        {node.unlinked_projects.length > 0 && (
          <details className="rounded-xl border border-dashed border-slate-300 bg-white">
            <summary className="px-3 py-2 cursor-pointer text-[11px] text-slate-600 select-none">
              <span className="font-semibold">
                {node.unlinked_projects.length} project tanpa Objective
              </span>
            </summary>
            <ul className="px-3 pb-2 space-y-1">
              {node.unlinked_projects.slice(0, 5).map((p) => (
                <li key={p.name}>
                  <Link
                    to={`/portal/projects/${encodeURIComponent(p.name)}`}
                    className="group flex items-center gap-2 text-[11px] rounded-md px-2 py-1 hover:bg-slate-50"
                  >
                    <span className="flex-1 truncate text-slate-700 group-hover:text-brand">
                      {p.title}
                    </span>
                    <Chip label={p.status} tone={statusTone(p.status)} />
                  </Link>
                </li>
              ))}
              {node.unlinked_projects.length > 5 && (
                <li className="text-[10px] text-slate-400 px-2">
                  +{node.unlinked_projects.length - 5} lagi…
                </li>
              )}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
};

type AlertState = {
  title: string;
  message: string;
  variant?: 'info' | 'error';
};

function AlertDialog({
  state,
  onClose,
}: {
  state: AlertState | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = !!state;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const isError = state?.variant === 'error';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed top-1/2 left-1/2 right-auto bottom-auto m-0 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm rounded-2xl p-0 bg-transparent backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm"
    >
      {state && (
        <div className="card w-full overflow-hidden">
          <div className="px-6 py-5 space-y-2">
            <h2
              className={`text-base font-semibold ${
                isError ? 'text-rose-700' : 'text-slate-900'
              }`}
            >
              {state.title}
            </h2>
            <p className="text-sm text-slate-600 whitespace-pre-line">{state.message}</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-3 bg-slate-50/60">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center h-8 px-3 rounded-md text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmState | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = !!state;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed top-1/2 left-1/2 right-auto bottom-auto m-0 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm rounded-2xl p-0 bg-transparent backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm"
    >
      {state && (
        <div className="card w-full overflow-hidden">
          <div className="px-6 py-5 space-y-2">
            <h2 className="text-base font-semibold text-slate-900">{state.title}</h2>
            <p className="text-sm text-slate-600 whitespace-pre-line">{state.message}</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-3 bg-slate-50/60">
            <button type="button" onClick={onClose} className="btn-ghost btn-sm">
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                state.onConfirm();
                onClose();
              }}
              className="inline-flex items-center h-8 px-3 rounded-md text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700"
            >
              {state.confirmLabel ?? 'Hapus'}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

export function StrategyPage() {
  const [query, setQuery] = useState('');
  const qc = useQueryClient();
  const [objModal, setObjModal] = useState<ObjectiveFormMode | null>(null);
  const [krModal, setKrModal] = useState<KeyResultFormMode | null>(null);
  const [kpiModal, setKpiModal] = useState<KpiDefinitionFormMode | null>(null);
  const [brandModal, setBrandModal] = useState<BrandFormMode | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [alertState, setAlertState] = useState<AlertState | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: STRATEGY_KEY(),
    queryFn: () => fetchBrandStrategyTree(),
    staleTime: STALE_TIME_MS,
  });

  const delObj = useMutation({
    mutationFn: (id: string) => deleteObjective(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand-strategy'] }),
  });
  const delKr = useMutation({
    mutationFn: (id: string) => deleteKeyResult(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand-strategy'] }),
  });
  const delKpi = useMutation({
    mutationFn: (id: string) => deleteKpiDefinition(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand-strategy'] }),
  });
  const delBrand = useMutation({
    mutationFn: (id: string) => deleteBrand(id),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['brand-strategy'] }),
        qc.invalidateQueries({ queryKey: ['brands'] }),
      ]),
    onError: (err: any) => {
      const msg =
        err?.response?.data?.exception ||
        err?.response?.data?.message ||
        err?.message ||
        'Gagal menghapus brand.';
      setAlertState({
        title: 'Gagal menghapus brand',
        message: String(msg),
        variant: 'error',
      });
    },
  });

  const actions: StrategyActions = {
    onCreateObjective: (brand) => setObjModal({ kind: 'create', brand }),
    onEditObjective: (obj) =>
      setObjModal({
        kind: 'edit',
        id: obj.name,
        initial: {
          title: obj.title,
          period: obj.period,
          period_start: obj.period_start ?? '',
          period_end: obj.period_end ?? '',
          objective_owner: obj.objective_owner,
          status: obj.status,
          pdca_phase: obj.pdca_phase,
        },
      }),
    onDeleteObjective: (id) =>
      setConfirmState({
        title: 'Hapus Objective?',
        message: `Objective ${id} akan dihapus permanen. Aksi ini tidak bisa di-undo.`,
        onConfirm: () => delObj.mutate(id),
      }),
    onCreateKr: (objective) => setKrModal({ kind: 'create', objective }),
    onEditKr: (kr) =>
      setKrModal({
        kind: 'edit',
        id: kr.name,
        initial: {
          metric: kr.metric,
          target_value: kr.target_value,
          current_value: kr.current_value,
          unit: kr.unit,
          confidence: kr.confidence,
        },
      }),
    onDeleteKr: (id) =>
      setConfirmState({
        title: 'Hapus Key Result?',
        message: `Key Result ${id} akan dihapus.`,
        onConfirm: () => delKr.mutate(id),
      }),
    onCreateKpi: (brand, objective) =>
      setKpiModal({ kind: 'create', brand, objective }),
    onEditKpi: (kpi, brand) =>
      setKpiModal({
        kind: 'edit',
        id: kpi.name,
        initial: {
          kpi_name: kpi.kpi_name,
          brand,
          frequency: kpi.frequency as 'Daily' | 'Weekly' | 'Monthly',
          unit: kpi.unit,
        },
      }),
    onDeleteKpi: (id) =>
      setConfirmState({
        title: 'Hapus KPI Definition?',
        message: `KPI Definition ${id} akan dihapus.`,
        onConfirm: () => delKpi.mutate(id),
      }),
    onDeleteBrand: (node) =>
      setConfirmState({
        title: `Hapus brand "${node.brand_name}"?`,
        message:
          'Brand akan dihapus permanen. Aksi ini tidak bisa di-undo.\nAkan gagal kalau masih ada Project yang terhubung ke brand ini.',
        onConfirm: () => delBrand.mutate(node.brand),
      }),
    onEditBrand: (node) =>
      setBrandModal({
        kind: 'edit',
        brandId: node.brand,
        initial: {
          brand_name: node.brand_name,
          logo: node.logo ?? '',
          description: node.description ?? '',
        },
      }),
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (b) =>
        b.brand_name.toLowerCase().includes(q) ||
        b.objectives.some((o) => o.title.toLowerCase().includes(q)),
    );
  }, [data, query]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">
            Strategy Map
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900 leading-tight">
            Brand → OKR → Project
          </h1>
          <p className="text-[14px] text-slate-600">
            Pohon strategi: Brand jadi root, Objective per periode, KR + KPI
            ngukur, Project mengeksekusi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            className="input w-64"
            placeholder="Cari brand atau objective…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setBrandModal({ kind: 'create' })}
            className="btn-primary btn-sm"
          >
            + Brand
          </button>
        </div>
      </header>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-pulse">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 card" />
          ))}
        </div>
      )}

      {isError && (
        <div className="card border-rose-100 bg-rose-50/60 px-5 py-4 text-sm text-rose-700">
          <span className="font-semibold">Gagal memuat strategi.</span>{' '}
          {String(error)}
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="card px-5 py-10 text-center text-sm text-slate-500">
          {query
            ? 'Tidak ada brand/objective cocok.'
            : 'Belum ada brand. Buat brand dulu di halaman Brands.'}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr">
        {filtered.map((b) => (
          <BrandBlock key={b.brand} node={b} actions={actions} />
        ))}
      </div>

      <ObjectiveFormModal
        open={!!objModal}
        mode={objModal}
        onClose={() => setObjModal(null)}
      />
      <KeyResultFormModal
        open={!!krModal}
        mode={krModal}
        onClose={() => setKrModal(null)}
      />
      <KpiDefinitionFormModal
        open={!!kpiModal}
        mode={kpiModal}
        onClose={() => setKpiModal(null)}
      />
      <BrandFormModal
        open={!!brandModal}
        mode={brandModal}
        onClose={() => setBrandModal(null)}
      />
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      <AlertDialog state={alertState} onClose={() => setAlertState(null)} />
    </div>
  );
}
