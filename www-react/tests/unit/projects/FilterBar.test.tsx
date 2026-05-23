import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from '@/features/projects/list/FilterBar';

describe('FilterBar', () => {
  it('toggles chip and calls onChange with merged filter', async () => {
    const onChange = vi.fn();
    render(<FilterBar value={{}} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /has-blockers/i }));
    expect(onChange).toHaveBeenLastCalledWith({ has_blockers: true });
  });

  it('search input debounces onChange', async () => {
    const onChange = vi.fn();
    render(<FilterBar value={{}} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'alpha' } });
    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith({ search: 'alpha' });
    });
  });

  it('sort dropdown updates filter', async () => {
    const onChange = vi.fn();
    render(<FilterBar value={{}} onChange={onChange} />);
    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'health_asc');
    expect(onChange).toHaveBeenLastCalledWith({ sort: 'health_asc' });
  });
});
