import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPicker } from '@/components/UserPicker';
import {
  createObjective,
  updateObjective,
  type ObjectiveFormValues,
} from './okrApi';

const STATUS_OPTS = ['Open', 'On Track', 'At Risk', 'Closed'];
const PDCA_OPTS = ['PLAN', 'DO', 'CHECK', 'ACT', 'CLOSED'];

const EMPTY: ObjectiveFormValues = {
  title: '',
  brand: '',
  period: '',
  period_start: '',
  period_end: '',
  objective_owner: '',
  status: 'Open',
  pdca_phase: 'PLAN',
  description: '',
};

export type ObjectiveFormMode =
  | { kind: 'create'; brand: string }
  | { kind: 'edit'; id: string; initial: Partial<ObjectiveFormValues> };

export function ObjectiveFormModal({
  open,
  mode,
  onClose,
}: {
  open: boolean;
  mode: ObjectiveFormMode | null;
  onClose: () => void;
}) {
  const [values, setValues] = useState<ObjectiveFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    if (!open || !mode) return;
    setError(null);
    if (mode.kind === 'create') {
      setValues({ ...EMPTY, brand: mode.brand });
    } else {
      setValues({ ...EMPTY, ...mode.initial });
    }
  }, [open, mode]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const m = useMutation({
    mutationFn: async () => {
      if (!mode) throw new Error('no_mode');
      if (mode.kind === 'create') return createObjective(values);
      return updateObjective(mode.id, values);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand-strategy'] });
      onClose();
    },
    onError: (err: any) => {
      setError(
        String(
          err?.response?.data?.exception ||
            err?.response?.data?.message ||
            err?.message ||
            'Gagal menyimpan objective.',
        ),
      );
    },
  });

  function set<K extends keyof ObjectiveFormValues>(k: K, v: ObjectiveFormValues[K]) {
    setValues((s) => ({ ...s, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!values.title || !values.period || !values.objective_owner || !values.brand) {
      setError('Title, Period, Owner, Brand wajib.');
      return;
    }
    m.mutate();
  }

  if (!mode) return null;
  const title = mode.kind === 'create' ? 'New Objective' : 'Edit Objective';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed top-1/2 left-1/2 m-0 -translate-x-1/2 -translate-y-1/2 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-xl rounded-2xl p-0 bg-transparent backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit} className="card w-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Brand: {values.brand}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-icon h-8 w-8 text-slate-400 hover:text-slate-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-slate-600">Title *</span>
            <input
              className="input"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              required
              autoFocus
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-slate-600">Period *</span>
              <input
                className="input"
                placeholder="2026-Q2 atau 2026"
                value={values.period}
                onChange={(e) => set('period', e.target.value)}
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-slate-600">Owner *</span>
              <UserPicker
                value={values.objective_owner}
                onChange={(v) => set('objective_owner', v)}
                allowClear={false}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-slate-600">Period Start</span>
              <input
                type="date"
                className="input"
                value={values.period_start ?? ''}
                onChange={(e) => set('period_start', e.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-slate-600">Period End</span>
              <input
                type="date"
                className="input"
                value={values.period_end ?? ''}
                onChange={(e) => set('period_end', e.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-slate-600">Status</span>
              <select
                className="input"
                value={values.status ?? 'Open'}
                onChange={(e) => set('status', e.target.value)}
              >
                {STATUS_OPTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-slate-600">PDCA</span>
              <select
                className="input"
                value={values.pdca_phase ?? 'PLAN'}
                onChange={(e) => set('pdca_phase', e.target.value)}
              >
                {PDCA_OPTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-slate-600">Description</span>
            <textarea
              className="input min-h-[80px]"
              value={values.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
        </div>

        {error && (
          <div className="mx-6 mb-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-3 bg-slate-50/60">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm">
            Cancel
          </button>
          <button type="submit" disabled={m.isPending} className="btn-primary btn-sm">
            {m.isPending ? 'Saving…' : mode.kind === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
