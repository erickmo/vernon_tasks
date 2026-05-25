import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createProject, updateProject } from '@/features/projects/projectsApi';
import type {
  ProjectFormValues,
  ProjectMemberInput,
  ProjectMemberRole,
  ProjectPdcaPhase,
  ProjectStatus,
} from '@/features/projects/types';
import { DatePicker } from './DatePicker';
import { UserPicker } from './UserPicker';
import { BrandPicker } from './BrandPicker';
import { ObjectivePicker } from './ObjectivePicker';

const STATUS_OPTIONS: ProjectStatus[] = ['Open', 'On Track', 'At Risk', 'Closed'];
const PDCA_OPTIONS: ProjectPdcaPhase[] = ['PLAN', 'DO', 'CHECK', 'ACT', 'CLOSED'];
const MEMBER_ROLES: ProjectMemberRole[] = ['Member'];

const EMPTY_FORM: ProjectFormValues = {
  title: '',
  brand: '',
  project_owner: '',
  project_leader: '',
  start_date: '',
  end_date: '',
  status: 'Open',
  pdca_phase: 'PLAN',
  objective: '',
  blocked_days_threshold: null,
  slip_pct_threshold: null,
  capacity_pct_threshold: null,
  team_members: [],
};

export type ProjectFormMode =
  | { kind: 'create' }
  | { kind: 'edit'; projectId: string; initial: Partial<ProjectFormValues> };

export function ProjectFormModal({
  open,
  mode,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: ProjectFormMode | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const [values, setValues] = useState<ProjectFormValues>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  useLayoutEffect(() => {
    if (!open || !mode) return;
    setError(null);
    if (mode.kind === 'edit') {
      setValues({ ...EMPTY_FORM, ...mode.initial, team_members: mode.initial.team_members ?? [] });
    } else {
      setValues(EMPTY_FORM);
    }
  }, [open, mode]);

  const m = useMutation({
    mutationFn: async () => {
      if (!mode) throw new Error('no_mode');
      if (mode.kind === 'create') return createProject(values);
      return updateProject(mode.projectId, values);
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project'] });
      onSaved?.(res?.id);
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.exception ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save project';
      setError(String(msg));
    },
  });

  if (!open || !mode) return null;

  const title = mode.kind === 'create' ? 'New project' : 'Edit project';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (
      !values.title ||
      !values.brand ||
      !values.project_owner ||
      !values.start_date ||
      !values.end_date
    ) {
      setError('Title, Brand, Owner, Start date, End date are required.');
      return;
    }
    if (values.end_date < values.start_date) {
      setError('End date cannot be earlier than start date.');
      return;
    }
    m.mutate();
  }

  function set<K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function setMember(idx: number, patch: Partial<ProjectMemberInput>) {
    setValues((v) => {
      const next = [...(v.team_members ?? [])];
      const cur = next[idx] ?? { user: '', role: 'Member' as ProjectMemberRole };
      next[idx] = { ...cur, ...patch };
      return { ...v, team_members: next };
    });
  }

  function addMember() {
    setValues((v) => ({
      ...v,
      team_members: [...(v.team_members ?? []), { user: '', role: 'Member', is_also_leader: false }],
    }));
  }

  function removeMember(idx: number) {
    setValues((v) => ({
      ...v,
      team_members: (v.team_members ?? []).filter((_, i) => i !== idx),
    }));
  }

  const memberUserIds = (values.team_members ?? []).map((m) => m.user).filter(Boolean);

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
        className="card w-full sm:w-[85vw] lg:w-[62vw] max-w-[1100px] my-auto flex flex-col max-h-[92vh] overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-8 py-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure team and schedule for this project.
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

        <div className="flex-1 overflow-y-auto px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-5">

        <Section label="Basics">
          <Field label="Title *">
            <input
              className="input"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              required
            />
          </Field>

          <Field label="Brand *">
            <BrandPicker
              value={values.brand}
              onChange={(v) => {
                setValues((cur) => ({
                  ...cur,
                  brand: v,
                  objective: v !== cur.brand ? '' : cur.objective,
                }));
              }}
              allowClear={false}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date *">
              <DatePicker
                value={values.start_date}
                onChange={(v) => set('start_date', v)}
                placeholder="Pick start date"
              />
            </Field>
            <Field label="End date *">
              <DatePicker
                value={values.end_date}
                onChange={(v) => set('end_date', v)}
                placeholder="Pick end date"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                className="input"
                value={values.status ?? 'Open'}
                onChange={(e) => set('status', e.target.value as ProjectStatus)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="PDCA phase">
              <select
                className="input"
                value={values.pdca_phase ?? 'PLAN'}
                onChange={(e) => set('pdca_phase', e.target.value as ProjectPdcaPhase)}
              >
                {PDCA_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Linked Objective">
            <ObjectivePicker
              value={values.objective ?? ''}
              onChange={(v) => set('objective', v)}
              brand={values.brand}
              disabled={!values.brand}
              placeholder={values.brand ? 'Pick objective…' : 'Pick a brand first'}
            />
          </Field>
        </Section>

          </div>

          <div className="lg:col-span-5 space-y-5 lg:border-l lg:border-slate-100 lg:pl-6">

        <Section label="Ownership">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner *">
              <UserPicker
                value={values.project_owner}
                onChange={(v) => set('project_owner', v)}
                allowClear={false}
              />
            </Field>
            <Field label="Leader">
              <UserPicker
                value={values.project_leader ?? ''}
                onChange={(v) => set('project_leader', v)}
              />
            </Field>
          </div>
        </Section>

        <Section label="Team Members">
          <div className="space-y-2">
            {(values.team_members ?? []).length === 0 && (
              <p className="text-xs text-slate-400">No members yet.</p>
            )}
            {(values.team_members ?? []).map((member, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_140px_auto_auto] items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-2 py-1.5"
              >
                <UserPicker
                  value={member.user}
                  onChange={(v) => setMember(idx, { user: v })}
                  exclude={memberUserIds.filter((u) => u !== member.user)}
                  placeholder="Pick user…"
                  allowClear={false}
                />
                <select
                  className="input"
                  value={member.role}
                  onChange={(e) =>
                    setMember(idx, { role: e.target.value as ProjectMemberRole })
                  }
                >
                  {MEMBER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 px-1">
                  <input
                    type="checkbox"
                    checked={!!member.is_also_leader}
                    onChange={(e) => setMember(idx, { is_also_leader: e.target.checked })}
                  />
                  Can manage
                </label>
                <button
                  type="button"
                  onClick={() => removeMember(idx)}
                  className="btn-icon h-7 w-7 text-rose-500 hover:text-rose-700"
                  aria-label="Remove member"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addMember}
              className="btn-ghost btn-sm"
            >
              + Add member
            </button>
          </div>
        </Section>
          </div>
        </div>

        {error && (
          <div className="mx-8 mb-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 px-8 py-4 bg-slate-50/60">
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

function Section({
  label,
  children,
  collapsible = false,
}: {
  label: string;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        className={
          'flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 ' +
          (collapsible ? 'cursor-pointer hover:text-slate-700' : 'cursor-default')
        }
      >
        <span>{label}</span>
        {collapsible && <span className="text-slate-300">{open ? '−' : '+'}</span>}
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
