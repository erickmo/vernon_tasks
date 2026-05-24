import { useState } from 'react';
import { toast } from 'sonner';
import { createSubscription } from './reportsApi';
import type { ReportExportFormat, ReportFilters } from './types';

const DEFAULT_CRON = '0 8 * * 1'; // Mondays 08:00 UTC

export function ScheduleModal({
  open,
  onClose,
  slug,
  title,
  filters,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  title: string;
  filters: ReportFilters;
}) {
  const [cron, setCron] = useState<string>(DEFAULT_CRON);
  const [format, setFormat] = useState<ReportExportFormat>('csv');
  const [recipients, setRecipients] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const users = recipients
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (users.length === 0) {
      toast.error('Add at least one recipient email');
      return;
    }
    setBusy(true);
    try {
      await createSubscription({
        slug,
        title,
        cron,
        format,
        filters,
        recipients: users,
      });
      toast.success('Schedule created');
      onClose();
    } catch {
      toast.error('Failed to create schedule');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Schedule report"
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center"
    >
      <div className="card p-6 w-full max-w-md space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
            Subscription
          </div>
          <h2 className="text-[20px] font-semibold tracking-tight text-slate-900 mt-0.5">
            Schedule report
          </h2>
        </div>

        <div>
          <label
            htmlFor="schedule-cron"
            className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1"
          >
            Cron (UTC)
          </label>
          <input
            id="schedule-cron"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            className="input"
          />
          <p className="text-[11px] text-slate-500 mt-1.5">
            Default: Mondays 08:00 UTC
          </p>
        </div>

        <div>
          <label
            htmlFor="schedule-format"
            className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1"
          >
            Format
          </label>
          <select
            id="schedule-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as ReportExportFormat)}
            className="input"
          >
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="schedule-recipients"
            className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1"
          >
            Recipients (comma-separated emails)
          </label>
          <input
            id="schedule-recipients"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="ada@vernon.id, leo@vernon.id"
            className="input"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary btn-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="btn-primary btn-sm"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
