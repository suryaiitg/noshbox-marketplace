import { useEffect, useState } from 'react';
import { apiFetch, getOrderRefunds, refundOrder } from '../api/client';
import type { Refund } from '../api/client';
import type { Order } from '../hooks/useOrders';
import { Money } from '../components/Money';
import { displayStatus, refundedCents, remainingCents } from '../lib/orders';

/**
 * Single-order view: line items with product details, totals, refund history, and (for
 * merchant/admin) the refund action. `onChanged` lets the parent refresh dependent views.
 */
export function OrderDetail({
  orderId,
  canRefund = false,
  onBack,
  onChanged,
}: {
  orderId: string;
  canRefund?: boolean;
  onBack: () => void;
  onChanged?: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([apiFetch<Order>(`/orders/${orderId}`), getOrderRefunds(orderId)])
      .then(([o, r]) => {
        if (!cancelled) {
          setOrder(o);
          setRefunds(r);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'error');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, nonce]);

  if (loading) {
    return <p>Loading order...</p>;
  }
  if (error || !order) {
    return (
      <div role="alert">
        Could not load order: {error ?? 'not_found'} <button onClick={onBack}>Back</button>
      </div>
    );
  }

  const refunded = refundedCents(order);
  const remaining = remainingCents(order);

  async function submitRefund(): Promise<void> {
    const trimmed = amount.trim();
    let cents: number | undefined;
    if (trimmed !== '') {
      const dollars = Number(trimmed);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        return;
      }
      cents = Math.round(dollars * 100);
    }
    setBusy(true);
    setRefundError(null);
    try {
      await refundOrder(orderId, cents);
      setAmount('');
      onChanged?.();
      setNonce((n) => n + 1);
    } catch (err: unknown) {
      setRefundError(err instanceof Error ? err.message : 'refund_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <button onClick={onBack}>← Back to orders</button>
      <h2>Order {order.id.slice(0, 8)}</h2>
      <p>
        Status: <strong>{displayStatus(order)}</strong>
      </p>
      <p className="muted">
        Customer {order.customer_id.slice(0, 8)} · Merchant {order.merchant_id.slice(0, 8)} ·
        Placed {new Date(order.created_at).toLocaleString()}
      </p>

      <table>
        <thead>
          <tr>
            <th align="left">Item</th>
            <th align="left">Category</th>
            <th align="left">Qty</th>
            <th align="left">Unit price</th>
            <th align="left">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {(order.items ?? []).map((it) => (
            <tr key={it.id}>
              <td>
                {it.name}
                {it.product_active === false ? ' (discontinued)' : ''}
              </td>
              <td>{it.category ?? '—'}</td>
              <td>{it.quantity}</td>
              <td>
                <Money cents={it.unit_price_cents} />
              </td>
              <td>
                <Money cents={it.unit_price_cents * it.quantity} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        Total: <Money cents={order.total_cents} /> · Refunded: <Money cents={refunded} /> ·
        Remaining: <Money cents={remaining} />
      </p>

      <h3>Refund history</h3>
      {refunds.length === 0 ? (
        <p className="muted">No refunds yet.</p>
      ) : (
        <ul>
          {refunds.map((r) => (
            <li key={r.id}>
              <Money cents={r.amount_cents} /> — {r.reason} — {new Date(r.created_at).toLocaleString()}
            </li>
          ))}
        </ul>
      )}

      {canRefund && (
        <>
          <h3>Issue refund</h3>
          {remaining <= 0 ? (
            <p className="muted">Fully refunded.</p>
          ) : (
            <>
              {refundError && <div role="alert">Refund failed: {refundError}</div>}
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={`max ${(remaining / 100).toFixed(2)}`}
                value={amount}
                disabled={busy}
                aria-label="Refund amount in dollars"
                onChange={(e) => setAmount(e.target.value)}
                style={{ width: '7rem', marginRight: '0.5rem' }}
              />
              <button disabled={busy} onClick={submitRefund}>
                {busy ? 'Refunding...' : 'Refund'}
              </button>
              <p className="muted">Leave blank to refund the full remaining balance.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
