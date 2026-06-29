const BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
}

/** Best-effort read of the role from the (unverified) JWT payload, for UI gating only. */
export function getRole(): string | null {
  const token = getToken();
  if (!token) {
    return null;
  }
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

/** Thin fetch wrapper that attaches the Bearer token and throws ApiError on non-2xx. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? 'request_failed');
  }
  return (await res.json()) as T;
}

export async function login(email: string): Promise<void> {
  const { token } = await apiFetch<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  setToken(token);
}

export interface Refund {
  id: string;
  order_id: string;
  amount_cents: number;
  reason: string;
  created_at: string;
}

/** Refund an order. With no amount the server refunds the full remaining balance. */
export async function refundOrder(orderId: string, amountCents?: number): Promise<Refund> {
  return apiFetch<Refund>(`/orders/${orderId}/refunds`, {
    method: 'POST',
    body: JSON.stringify(amountCents === undefined ? {} : { amount_cents: amountCents }),
  });
}

export async function getOrderRefunds(orderId: string): Promise<Refund[]> {
  return apiFetch<Refund[]>(`/orders/${orderId}/refunds`);
}

export async function getStoreCredit(): Promise<number> {
  const { balance_cents } = await apiFetch<{ balance_cents: number }>('/me/store-credit');
  return balance_cents;
}
