import type { Order } from '../hooks/useOrders';

/** Refunded so far, defaulting to 0 when the server hasn't reported it. */
export function refundedCents(order: Order): number {
  return order.refunded_cents ?? 0;
}

export function remainingCents(order: Order): number {
  return order.total_cents - refundedCents(order);
}

/** Derived display status so refunds are visible without persisting a redundant column. */
export function displayStatus(order: Order): string {
  const refunded = refundedCents(order);
  if (order.status === 'completed' && refunded > 0) {
    return refunded >= order.total_cents ? 'refunded' : 'partially refunded';
  }
  return order.status;
}
