import { useState } from 'react';
import { useOrders } from '../hooks/useOrders';
import type { Order } from '../hooks/useOrders';
import { Money } from '../components/Money';
import { refundOrder } from '../api/client';

/** Refunded so far, defaulting to 0 when the server hasn't reported it. */
function refundedCents(order: Order): number {
  return order.refunded_cents ?? 0;
}

function remainingCents(order: Order): number {
  return order.total_cents - refundedCents(order);
}

/** Derived display status so refunds are visible without persisting a redundant column. */
function displayStatus(order: Order): string {
  const refunded = refundedCents(order);
  if (order.status === 'completed' && refunded > 0) {
    return refunded >= order.total_cents ? 'refunded' : 'partially refunded';
  }
  return order.status;
}

/**
 * Orders list with loading / error / empty / data states. When `canRefund` is set (merchant/admin),
 * each row gets a refund control (blank amount = full remaining); `onRefunded` lets the parent
 * refresh dependent views (e.g. the customer's store-credit balance).
 */
export function OrdersList({
  canRefund = false,
  onRefunded,
}: {
  canRefund?: boolean;
  onRefunded?: () => void;
}) {
  const { data, loading, error, reload } = useOrders();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);

  async function refund(orderId: string, amountCents?: number): Promise<void> {
    setBusyId(orderId);
    setRefundError(null);
    try {
      await refundOrder(orderId, amountCents);
      onRefunded?.();
      reload();
    } catch (err: unknown) {
      setRefundError(err instanceof Error ? err.message : 'refund_failed');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p>Loading orders...</p>;
  }

  if (error) {
    return (
      <div role="alert">
        Could not load orders: {error} <button onClick={reload}>Retry</button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p>No orders yet.</p>;
  }

  return (
    <>
      {refundError && <div role="alert">Refund failed: {refundError}</div>}
      <table>
        <thead>
          <tr>
            <th align="left">Order</th>
            <th align="left">Status</th>
            <th align="left">Total</th>
            <th align="left">Refunded</th>
            {canRefund && <th align="left">Refund</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((order) => (
            <tr key={order.id}>
              <td>{order.id.slice(0, 8)}</td>
              <td>{displayStatus(order)}</td>
              <td>
                <Money cents={order.total_cents} />
              </td>
              <td>
                <Money cents={refundedCents(order)} />
              </td>
              {canRefund && (
                <td>
                  <RefundControl
                    remaining={remainingCents(order)}
                    busy={busyId === order.id}
                    onRefund={(amountCents) => refund(order.id, amountCents)}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * Per-order refund input. Leave the amount blank to refund the full remaining balance, or enter a
 * dollar amount for a partial refund. The control is disabled once nothing remains to refund.
 */
function RefundControl({
  remaining,
  busy,
  onRefund,
}: {
  remaining: number;
  busy: boolean;
  onRefund: (amountCents?: number) => void;
}) {
  const [amount, setAmount] = useState('');

  if (remaining <= 0) {
    return <span className="muted">Fully refunded</span>;
  }

  function submit(): void {
    const trimmed = amount.trim();
    if (trimmed === '') {
      onRefund(undefined); // full remaining
      return;
    }
    const dollars = Number(trimmed);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      return;
    }
    onRefund(Math.round(dollars * 100));
  }

  return (
    <span>
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
      <button disabled={busy} onClick={submit}>
        {busy ? 'Refunding...' : 'Refund'}
      </button>
    </span>
  );
}
