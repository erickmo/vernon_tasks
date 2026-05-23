import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TodayCard } from '@/features/dashboard/components/TodayCard';

const data = {
  ontime_rate_7d: 0.84,
  blocked_count: 3,
  okr_confidence_delta_wow: -0.05,
  next_deadline: { id: 't1', title: 'Ship login', due_date: '2026-05-25' },
  pdca_queue: { PLAN: 2, DO: 4, CHECK: 1 },
};

describe('TodayCard', () => {
  it('shows ontime rate as percentage', () => {
    render(
      <MemoryRouter>
        <TodayCard data={data} />
      </MemoryRouter>,
    );
    expect(screen.getByText('84%')).toBeInTheDocument();
  });

  it('highlights blocked count as danger when > 0', () => {
    render(
      <MemoryRouter>
        <TodayCard data={data} />
      </MemoryRouter>,
    );
    const tile = screen.getByRole('button', { name: /blocked/i });
    expect(tile).toHaveTextContent('3');
  });

  it('shows org_health_score when exec data provided', () => {
    render(
      <MemoryRouter>
        <TodayCard data={{ ...data, org_health_score: 72 }} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/72/)).toBeInTheDocument();
  });
});
