import { api } from '@/lib/api';
import type {
  ReportExportFormat,
  ReportFilters,
  ReportListItem,
  ReportPayload,
} from './types';

const BASE = '/api/method/vernon_tasks.task.api.portal_reports';

export const REPORTS_KEY = {
  list: ['reports', 'list'] as const,
  run: (slug: string, filters: ReportFilters) =>
    ['report', slug, filters] as const,
};

export async function listReports(): Promise<ReportListItem[]> {
  const res = await api.get<{ message: ReportListItem[] }>(
    `${BASE}.list_reports`,
  );
  return res.data.message ?? [];
}

export async function runReport(
  slug: string,
  filters: ReportFilters,
): Promise<ReportPayload> {
  const res = await api.get<{ message: ReportPayload }>(`${BASE}.run_report`, {
    params: { slug, filters: JSON.stringify(filters ?? {}) },
  });
  return res.data.message;
}

export async function exportReport(
  slug: string,
  filters: ReportFilters,
  format: ReportExportFormat,
): Promise<Blob> {
  const res = await api.get(`${BASE}.export`, {
    params: { slug, filters: JSON.stringify(filters ?? {}), format },
    responseType: 'blob',
  });
  return res.data as Blob;
}

export async function createSubscription(input: {
  slug: string;
  title: string;
  cron: string;
  format: ReportExportFormat;
  filters: ReportFilters;
  recipients: string[];
}): Promise<{ name: string }> {
  const res = await api.post<{ message: { name: string } }>(
    `${BASE}.create_subscription`,
    {
      slug: input.slug,
      title: input.title,
      cron: input.cron,
      format: input.format,
      filters: JSON.stringify(input.filters ?? {}),
      recipients: input.recipients,
    },
  );
  return res.data.message;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
