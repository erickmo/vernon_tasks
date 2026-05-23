export type ReportColumnType = 'string' | 'number' | 'date' | 'datetime';

export type ReportColumn = {
  key: string;
  label: string;
  type: ReportColumnType;
};

export type ReportListItem = {
  slug: string;
  title: string;
  audience: string[];
};

export type ReportFilters = Record<string, unknown>;

export type ReportPayload = {
  slug: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  viz: Record<string, unknown>;
  narrative: string[];
};

export type ReportExportFormat = 'csv' | 'pdf';
