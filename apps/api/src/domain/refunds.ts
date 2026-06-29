/**
 * Pure refund-amount rules. No database, no HTTP: keep the money math here so it is
 * cheap to unit-test, mirroring domain/money.ts. All amounts are integer cents.
 */
import { isValidAmountCents } from './money';

/** The slice of an order needed to decide whether/how much can be refunded. */
export interface RefundableOrder {
  total_cents: number;
  status: string;
}

export type RefundError = 'order_not_refundable' | 'invalid_amount' | 'refund_exceeds_total';

export type RefundResolution =
  | { ok: true; amountCents: number }
  | { ok: false; error: RefundError };

/** How much of an order can still be refunded, given what has already been refunded. */
export function maxRefundableCents(orderTotalCents: number, alreadyRefundedCents: number): number {
  return orderTotalCents - alreadyRefundedCents;
}

/**
 * Decide the refund amount. A missing `requestedCents` means "refund everything that is left".
 * Only `completed` orders are refundable, the amount must be a positive integer number of cents,
 * and cumulative refunds may never exceed the order total.
 */
export function resolveRefundAmount(
  order: RefundableOrder,
  alreadyRefundedCents: number,
  requestedCents?: number,
): RefundResolution {
  if (order.status !== 'completed') {
    return { ok: false, error: 'order_not_refundable' };
  }

  const remaining = maxRefundableCents(order.total_cents, alreadyRefundedCents);
  if (remaining <= 0) {
    return { ok: false, error: 'refund_exceeds_total' };
  }

  const amount = requestedCents ?? remaining;
  if (!isValidAmountCents(amount) || amount <= 0) {
    return { ok: false, error: 'invalid_amount' };
  }
  if (amount > remaining) {
    return { ok: false, error: 'refund_exceeds_total' };
  }

  return { ok: true, amountCents: amount };
}
