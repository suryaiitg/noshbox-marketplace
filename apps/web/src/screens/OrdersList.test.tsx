import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OrdersList } from './OrdersList';
import { apiFetch } from '../api/client';

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
}));

const mockedFetch = vi.mocked(apiFetch);

describe('OrdersList', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it('shows an empty state when there are no orders', async () => {
    mockedFetch.mockResolvedValue([]);
    render(<OrdersList />);
    await waitFor(() => expect(screen.getByText('No orders yet.')).toBeInTheDocument());
  });

  it('renders order rows with formatted totals', async () => {
    mockedFetch.mockResolvedValue([
      {
        id: 'abcdef12-3456',
        customer_id: 'c',
        merchant_id: 'm',
        total_cents: 1599,
        status: 'completed',
        created_at: '',
      },
    ]);
    render(<OrdersList />);
    await waitFor(() => expect(screen.getByText('$15.99')).toBeInTheDocument());
  });

  it('shows an error state with a retry control', async () => {
    mockedFetch.mockRejectedValue(new Error('forbidden'));
    render(<OrdersList />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('forbidden'));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
