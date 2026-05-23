import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportShell } from '@/features/reports/ReportShell';
import type { ReportPayload } from '@/features/reports/types';

const payload: ReportPayload = {
  slug: 'my-points',
  title: 'My Points',
  columns: [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'points', label: 'Points', type: 'number' },
  ],
  rows: [
    { date: '2026-05-22', points: 5 },
    { date: '2026-05-21', points: 3 },
  ],
  viz: { type: 'line' },
  narrative: ['Total 8 points'],
};

describe('ReportShell', () => {
  it('renders title, columns, rows, and narrative', () => {
    render(
      <ReportShell
        payload={payload}
        filters={{}}
        onFiltersChange={() => {}}
        onSchedule={() => {}}
        onRefresh={() => {}}
        vizSlot={<div data-testid="viz">VIZ</div>}
      />,
    );
    expect(screen.getByText('My Points')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Points')).toBeInTheDocument();
    expect(screen.getByText('2026-05-22')).toBeInTheDocument();
    expect(screen.getByText(/Total 8 points/)).toBeInTheDocument();
    expect(screen.getByTestId('viz')).toBeInTheDocument();
  });

  it('renders empty-state row when no data', () => {
    render(
      <ReportShell
        payload={{ ...payload, rows: [], narrative: [] }}
        filters={{}}
        onFiltersChange={() => {}}
        onSchedule={() => {}}
        onRefresh={() => {}}
        vizSlot={<div />}
      />,
    );
    expect(screen.getByText(/No data/i)).toBeInTheDocument();
  });

  it('fires onRefresh and onSchedule on toolbar clicks', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onSchedule = vi.fn();
    render(
      <ReportShell
        payload={payload}
        filters={{}}
        onFiltersChange={() => {}}
        onSchedule={onSchedule}
        onRefresh={onRefresh}
        vizSlot={<div />}
      />,
    );
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    await user.click(screen.getByRole('button', { name: /schedule/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onSchedule).toHaveBeenCalledTimes(1);
  });
});
