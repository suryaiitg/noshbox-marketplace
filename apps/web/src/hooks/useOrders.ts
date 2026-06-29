import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';

export interface OrderItem {
  id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price_cents: number;
  category: string | null;
  product_active: boolean | null;
}

export interface Order {
  id: string;
  customer_id: string;
  merchant_id: string;
  total_cents: number;
  status: string;
  created_at: string;
  refunded_cents?: number;
  items?: OrderItem[];
}

interface State {
  data: Order[] | null;
  loading: boolean;
  error: string | null;
}

/** Fetch hook with explicit loading / error / data states. */
export function useOrders(): State & { reload: () => void } {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    apiFetch<Order[]>('/orders')
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ data: null, loading: false, error: err instanceof Error ? err.message : 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}
