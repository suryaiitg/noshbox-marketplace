import { describe, it, expect } from 'vitest';
import { canRefundOrder } from '../auth/policy';
import type { OrderRef, Principal } from '../auth/policy';
import { maxRefundableCents, resolveRefundAmount } from '../domain/refunds';

const order: OrderRef = { customer_id: 'cust-1', merchant_id: 'merch-1' };

describe('canRefundOrder', () => {
  it('lets an admin refund any order', () => {
    const user: Principal = { id: 'admin-1', role: 'admin', email: 'a@x.com' };
    expect(canRefundOrder(user, order)).toBe(true);
  });

  it('lets the owning merchant refund', () => {
    const user: Principal = { id: 'merch-1', role: 'merchant', email: 'm@x.com' };
    expect(canRefundOrder(user, order)).toBe(true);
  });

  it('blocks a different merchant', () => {
    const user: Principal = { id: 'merch-2', role: 'merchant', email: 'm2@x.com' };
    expect(canRefundOrder(user, order)).toBe(false);
  });

  it('never lets a customer refund, even their own order', () => {
    const user: Principal = { id: 'cust-1', role: 'customer', email: 'c@x.com' };
    expect(canRefundOrder(user, order)).toBe(false);
  });
});

describe('maxRefundableCents', () => {
  it('is total minus already-refunded', () => {
    expect(maxRefundableCents(1000, 0)).toBe(1000);
    expect(maxRefundableCents(1000, 400)).toBe(600);
    expect(maxRefundableCents(1000, 1000)).toBe(0);
  });
});

describe('resolveRefundAmount', () => {
  const completed = { total_cents: 1000, status: 'completed' };

  it('defaults to the full remaining amount when none is requested', () => {
    expect(resolveRefundAmount(completed, 0)).toEqual({ ok: true, amountCents: 1000 });
    expect(resolveRefundAmount(completed, 300)).toEqual({ ok: true, amountCents: 700 });
  });

  it('accepts a valid partial amount', () => {
    expect(resolveRefundAmount(completed, 0, 250)).toEqual({ ok: true, amountCents: 250 });
  });

  it('accepts an amount equal to the remaining balance', () => {
    expect(resolveRefundAmount(completed, 600, 400)).toEqual({ ok: true, amountCents: 400 });
  });

  it('rejects an amount one cent over the remaining balance', () => {
    expect(resolveRefundAmount(completed, 600, 401)).toEqual({
      ok: false,
      error: 'refund_exceeds_total',
    });
  });

  it('rejects when the order is already fully refunded', () => {
    expect(resolveRefundAmount(completed, 1000)).toEqual({
      ok: false,
      error: 'refund_exceeds_total',
    });
  });

  it('rejects zero, negative, and non-integer amounts', () => {
    expect(resolveRefundAmount(completed, 0, 0).ok).toBe(false);
    expect(resolveRefundAmount(completed, 0, -50).ok).toBe(false);
    expect(resolveRefundAmount(completed, 0, 12.5).ok).toBe(false);
  });

  it('refuses to refund a non-completed order', () => {
    expect(resolveRefundAmount({ total_cents: 1000, status: 'cancelled' }, 0)).toEqual({
      ok: false,
      error: 'order_not_refundable',
    });
  });
});
