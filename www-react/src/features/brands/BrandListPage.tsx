import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BRAND_KEY,
  deleteBrand,
  getBrandPermissions,
  listBrands,
} from './brandsApi';
import type { Brand } from './types';
import { BrandFormModal, type BrandFormMode } from './BrandFormModal';
import { ApiErrorMessage } from '@/lib/ApiErrorMessage';

export function BrandListPage() {
  const [search, setSearch] = useState('');
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: BRAND_KEY.list(search),
    queryFn: () => listBrands(search),
  });
  const { data: perms } = useQuery({
    queryKey: BRAND_KEY.permissions(),
    queryFn: getBrandPermissions,
    staleTime: 5 * 60 * 1000,
  });
  const [modalMode, setModalMode] = useState<BrandFormMode | null>(null);
  const [pendingDelete, setPendingDeleteState] = useState<Brand | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = deleteDialogRef.current;
    if (!d) return;
    if (pendingDelete && !d.open) d.showModal();
    if (!pendingDelete && d.open) d.close();
  }, [pendingDelete]);

  const canCreate = !!perms?.can_create;
  const canEdit = !!perms?.can_write;
  const canDelete = !!perms?.can_delete;

  const del = useMutation({
    mutationFn: (id: string) => deleteBrand(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brands'] });
      setPendingDeleteState(null);
    },
  });

  function setPendingDelete(b: Brand | null) {
    del.reset();
    setPendingDeleteState(b);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
            Manage
          </div>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight text-slate-900">Brands</h1>
          <p className="mt-1 text-sm text-slate-500">
            Brands group projects by client or product line.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setModalMode({ kind: 'create' })}
            className="btn-primary btn-sm"
          >
            + New Brand
          </button>
        )}
      </header>

      <div className="flex items-center gap-3">
        <input
          type="search"
          className="input max-w-sm"
          placeholder="Search brands…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {data && <span className="text-xs text-slate-500">{data.length} brand(s)</span>}
      </div>

      {isLoading && (
        <div className="card p-8 text-center text-sm text-slate-500">Loading brands…</div>
      )}
      {isError && (
        <div className="card p-8 text-center text-sm text-rose-600">Failed to load brands.</div>
      )}
      {data && data.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/40 p-12 text-center">
          <p className="text-sm text-slate-500">No brands yet.</p>
          {canCreate && (
            <button
              type="button"
              onClick={() => setModalMode({ kind: 'create' })}
              className="btn-primary btn-sm mt-3"
            >
              + Create first brand
            </button>
          )}
        </div>
      )}
      {data && data.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="py-3 pl-4 font-medium w-14">Logo</th>
                <th className="py-3 font-medium">Brand name</th>
                <th className="py-3 font-medium">Description</th>
                {(canEdit || canDelete) && (
                  <th className="py-3 pr-4 font-medium text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60"
                >
                  <td className="py-3 pl-4">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500 overflow-hidden border border-slate-200">
                      {b.logo ? (
                        <img src={b.logo} alt="" className="h-full w-full object-cover" />
                      ) : (
                        b.brand_name.slice(0, 1).toUpperCase()
                      )}
                    </span>
                  </td>
                  <td className="py-3 font-medium text-slate-900">{b.brand_name}</td>
                  <td className="py-3 text-slate-600 max-w-md truncate">
                    {b.description || <span className="text-slate-400">—</span>}
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            setModalMode({
                              kind: 'edit',
                              brandId: b.id,
                              initial: {
                                brand_name: b.brand_name,
                                logo: b.logo ?? '',
                                description: b.description ?? '',
                              },
                            })
                          }
                          className="text-xs font-medium text-brand hover:underline mr-3"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(b)}
                          className="text-xs font-medium text-rose-600 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BrandFormModal
        open={modalMode !== null}
        mode={modalMode}
        onClose={() => setModalMode(null)}
      />

      <dialog
        ref={deleteDialogRef}
        onClose={() => setPendingDelete(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setPendingDelete(null);
        }}
        className="fixed top-1/2 left-1/2 right-auto bottom-auto m-0 -translate-x-1/2 -translate-y-1/2 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-sm rounded-2xl p-0 bg-transparent backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm"
      >
        {pendingDelete && (
          <div className="card w-full p-6 space-y-4">
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">
              Delete brand?
            </h2>
            <p className="text-sm text-slate-600">
              <strong>{pendingDelete.brand_name}</strong> will be permanently deleted. Brands
              linked to projects cannot be deleted.
            </p>
            {del.isError && (
              <ApiErrorMessage
                error={del.error}
                fallback="Failed to delete brand."
                className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700"
              />
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={del.isPending}
                onClick={() => del.mutate(pendingDelete.id)}
                className="btn-sm rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {del.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
