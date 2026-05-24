import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrand, updateBrand } from './brandsApi';
import type { BrandFormValues } from './types';

const EMPTY: BrandFormValues = { brand_name: '', logo: '', description: '' };

export type BrandFormMode =
  | { kind: 'create' }
  | { kind: 'edit'; brandId: string; initial: BrandFormValues };

export function BrandFormModal({
  open,
  mode,
  onClose,
}: {
  open: boolean;
  mode: BrandFormMode | null;
  onClose: () => void;
}) {
  const [values, setValues] = useState<BrandFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open || !mode) return;
    setError(null);
    setValues(mode.kind === 'edit' ? { ...EMPTY, ...mode.initial } : EMPTY);
  }, [open, mode]);

  const m = useMutation({
    mutationFn: async () => {
      if (!mode) throw new Error('no_mode');
      if (mode.kind === 'create') return createBrand(values);
      return updateBrand(mode.brandId, values);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brands'] });
      qc.invalidateQueries({ queryKey: ['brand-search'] });
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.exception ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save brand';
      setError(String(msg));
    },
  });

  if (!open || !mode) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!values.brand_name?.trim()) {
      setError('Brand name is required.');
      return;
    }
    m.mutate();
  }

  function set<K extends keyof BrandFormValues>(key: K, value: BrandFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  const title = mode.kind === 'create' ? 'New brand' : 'Edit brand';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="card w-full max-w-md my-auto flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
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
            <span className="block text-xs font-medium text-slate-600">Brand name *</span>
            <input
              className="input"
              value={values.brand_name}
              onChange={(e) => set('brand_name', e.target.value)}
              autoFocus
              required
            />
          </label>

          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-slate-600">Logo URL</span>
            <input
              className="input"
              placeholder="https://… or /files/…"
              value={values.logo ?? ''}
              onChange={(e) => set('logo', e.target.value)}
            />
            {values.logo && (
              <img
                src={values.logo}
                alt=""
                className="mt-2 h-12 w-12 rounded object-cover border border-slate-200"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
            )}
          </label>

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
    </div>,
    document.body,
  );
}
