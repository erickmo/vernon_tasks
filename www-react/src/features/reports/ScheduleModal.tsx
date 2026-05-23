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
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    >
      <div className="bg-white dark:bg-slate-900 p-6 rounded-lg w-full max-w-md space-y-3">
        <h2 className="font-semibold">Schedule report</h2>
        <div>
          <label
            htmlFor="schedule-cron"
            className="block text-xs text-slate-500"
          >
            Cron (UTC)
          </label>
          <input
            id="schedule-cron"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            className="w-full text-sm border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Default: Mondays 08:00 UTC
          </p>
        </div>
        <div>
          <label
            htmlFor="schedule-format"
            className="block text-xs text-slate-500"
          >
            Format
          </label>
          <select
            id="schedule-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as ReportExportFormat)}
            className="w-full text-sm border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent"
          >
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="schedule-recipients"
            className="block text-xs text-slate-500"
          >
            Recipients (comma-separated emails)
          </label>
          <input
            id="schedule-recipients"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="ada@vernon.id, leo@vernon.id"
            className="w-full text-sm border border-slate-300 dark:border-slate-700 rounded px-2 py-1 bg-transparent"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded disabled:opacity-60 hover:bg-purple-700"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
