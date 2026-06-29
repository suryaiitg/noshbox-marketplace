import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { canViewOrder } from '../auth/policy';
import type { OrderRef, Principal } from '../auth/policy';
import { requireRole } from '../auth/middleware';

const order: OrderRef = { customer_id: 'cust-1', merchant_id: 'merch-1' };

describe('canViewOrder', () => {
  it('lets the owning customer view', () => {
    const user: Principal = { id: 'cust-1', role: 'customer', email: 'c@x.com' };
    expect(canViewOrder(user, order)).toBe(true);
  });

  it('blocks a different customer', () => {
    const user: Principal = { id: 'cust-2', role: 'customer', email: 'c2@x.com' };
    expect(canViewOrder(user, order)).toBe(false);
  });

  it('lets the owning merchant view', () => {
    const user: Principal = { id: 'merch-1', role: 'merchant', email: 'm@x.com' };
    expect(canViewOrder(user, order)).toBe(true);
  });

  it('blocks a different merchant', () => {
    const user: Principal = { id: 'merch-2', role: 'merchant', email: 'm2@x.com' };
    expect(canViewOrder(user, order)).toBe(false);
  });

  it('lets an admin view anything', () => {
    const user: Principal = { id: 'admin-1', role: 'admin', email: 'a@x.com' };
    expect(canViewOrder(user, order)).toBe(true);
  });
});

describe('requireRole', () => {
  function mockRes(): Response {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  }

  it('403s when the role is not allowed', () => {
    const req = { user: { id: 'u', role: 'customer', email: 'c@x.com' } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    requireRole('merchant', 'admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when the role is allowed', () => {
    const req = { user: { id: 'u', role: 'merchant', email: 'm@x.com' } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    requireRole('merchant', 'admin')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
