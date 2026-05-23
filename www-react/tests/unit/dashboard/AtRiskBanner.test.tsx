import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AtRiskBanner } from '@/features/dashboard/components/AtRiskBanner';

describe('AtRiskBanner', () => {
  it('renders nothing when list empty', () => {
    const { container } = render(
      <MemoryRouter>
        <AtRiskBanner items={[]} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('summarises count and first two items', () => {
    render(
      <MemoryRouter>
        <AtRiskBanner
          items={[
            { project_id: 'p1', project_name: 'Alpha', reason: 'health -12 WoW', severity: 'high' },
            { project_id: 'p2', project_name: 'Beta', reason: 'overdue', severity: 'med' },
            { project_id: 'p3', project_name: 'Gamma', reason: 'no checkin', severity: 'med' },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/3 projects at risk/i)).toBeInTheDocument();
    expect(screen.getByText(/Alpha/)).toBeInTheDocument();
    expect(screen.getByText(/Beta/)).toBeInTheDocument();
  });
});
