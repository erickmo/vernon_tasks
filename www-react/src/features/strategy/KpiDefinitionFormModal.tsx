import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createKpiDefinition,
  updateKpiDefinition,
  type KpiDefinitionFormValues,
} from './okrApi';

const FREQS: KpiDefinitionFormValues['frequency'][] = ['Daily', 'Weekly', 'Monthly'];

const EMPTY: KpiDefinitionFormValues = {
  kpi_name: '',
  brand: '',
  frequency: 'Daily',
  unit: '',
  objective: '',
  formula: '',
};

export type KpiDefinitionFormMode =
  | { kind: 'create'; brand: string; objective?: string }
  | { kind: 'edit'; id: string; initial: Partial<KpiDefinitionFormValues> };

export function KpiDefinitionFormModal({
  open,
  mode,
  onClose,
}: {
  open: boolean;
  mode: KpiDefinitionFormMode | null;
  onClose: () => void;
}) {
  const [values, setValues] = useState<KpiDefinitionFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    if (!open || !mode) return;
    setError(null);
    if (mode.kind === 'create') {
      setValues({ ...EMPTY, brand: mode.brand, objective: mode.objective ?? '' });
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
      if (mode.kind === 'create') return createKpiDefinition(values);
      return updateKpiDefinition(mode.id, values);
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
            'Gagal menyimpan KPI.',
        ),
      );
    },
  });

  function set<K extends keyof KpiDefinitionFormValues>(k: K, v: KpiDefinitionFormValues[K]) {
    setValues((s) => ({ ...s, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!values.kpi_name || !values.frequency || !values.brand) {
      setError('Name, frequency, brand wajib.');
      return;
    }
    m.mutate();
  }

  if (!mode) return null;
  const title = mode.kind === 'create' ? 'New KPI Definition' : 'Edit KPI Definition';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed top-1/2 left-1/2 m-0 -translate-x-1/2 -translate-y-1/2 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-md rounded-2xl p-0 bg-transparent backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit} className="card w-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Brand: {values.brand}
              {values.objective ? ` · Obj: ${values.objective}` : ''}
            </p>
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

        <div className="px-6 py-5 space-y-4">
          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-slate-600">KPI Name *</span>
            <input
              className="input"
              value={values.kpi_name}
              onChange={(e) => set('kpi_name', e.target.value)}
              required
              autoFocus
              disabled={mode.kind === 'edit'}
            />
            {mode.kind === 'edit' && (
              <span className="block text-[11px] text-slate-400">
                KPI Name jadi ID — tidak bisa diubah.
              </span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-slate-600">Frequency *</span>
              <select
                className="input"
                value={values.frequency}
                onChange={(e) =>
                  set('frequency', e.target.value as KpiDefinitionFormValues['frequency'])
                }
              >
                {FREQS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="block text-xs font-medium text-slate-600">Unit</span>
              <input
                className="input"
                placeholder="%, IDR, units"
                value={values.unit ?? ''}
                onChange={(e) => set('unit', e.target.value)}
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-slate-600">Formula / Description</span>
            <textarea
              className="input min-h-[80px]"
              value={values.formula ?? ''}
              onChange={(e) => set('formula', e.target.value)}
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
