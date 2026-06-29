import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { getClient, query } from '@app/db';
import type { OrderRow, RefundRow } from '@app/db';
import { requireAuth, requireRole } from '../auth/middleware';
import { canRefundOrder, canViewOrder } from '../auth/policy';
import { resolveRefundAmount } from '../domain/refunds';

export const refundsRouter = Router();

refundsRouter.use(requireAuth);

const refundBodySchema = z.object({
  amount_cents: z.number().int().positive().optional(),
  reason: z.string().min(1).max(200).optional(),
  idempotency_key: z.string().min(1).max(200).optional(),
});

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Issue a refund for an order as store credit to the customer. Merchant (own orders) or admin.
 *
 * Correctness: the whole thing runs in one transaction. We lock the order row (FOR UPDATE) so
 * concurrent refunds can't both read the same "already refunded" total and over-refund. An
 * optional idempotency_key makes retries safe — a replay returns the original refund instead of
 * crediting again.
 */
refundsRouter.post(
  '/:id/refunds',
  requireRole('merchant', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user!;
    const parsed = refundBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    const { amount_cents, reason, idempotency_key } = parsed.data;
    const orderId = req.params.id;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<OrderRow>(
        'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
        [orderId],
      );
      const order = rows[0];
      if (!order) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'order_not_found' });
        return;
      }
      if (!canRefundOrder(user, order)) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      // Idempotent replay: same order + key already refunded -> return the original.
      if (idempotency_key) {
        const prior = await client.query<RefundRow>(
          'SELECT * FROM refunds WHERE order_id = $1 AND idempotency_key = $2',
          [orderId, idempotency_key],
        );
        if (prior.rows[0]) {
          await client.query('COMMIT');
          res.status(200).json(prior.rows[0]);
          return;
        }
      }

      const { rows: sumRows } = await client.query<{ sum: string }>(
        'SELECT COALESCE(SUM(amount_cents), 0)::bigint AS sum FROM refunds WHERE order_id = $1',
        [orderId],
      );
      const alreadyRefunded = Number(sumRows[0]?.sum ?? 0);

      const resolved = resolveRefundAmount(order, alreadyRefunded, amount_cents);
      if (!resolved.ok) {
        await client.query('ROLLBACK');
        const status = resolved.error === 'order_not_refundable' ? 409 : 400;
        res.status(status).json({ error: resolved.error });
        return;
      }

      const ledger = await client.query<{ id: string }>(
        'INSERT INTO store_credit_ledger (user_id, delta_cents, reason) VALUES ($1, $2, $3) RETURNING id',
        [order.customer_id, resolved.amountCents, 'refund'],
      );
      const ledgerId = ledger.rows[0]!.id;

      const refund = await client.query<RefundRow>(
        `INSERT INTO refunds (order_id, amount_cents, reason, created_by, ledger_entry_id, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [orderId, resolved.amountCents, reason ?? 'merchant_refund', user.id, ledgerId, idempotency_key ?? null],
      );

      await client.query('COMMIT');
      res.status(201).json(refund.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);

      // Lost an idempotency-key race with a concurrent identical request: return the winner.
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION && idempotency_key) {
        const prior = await query<RefundRow>(
          'SELECT * FROM refunds WHERE order_id = $1 AND idempotency_key = $2',
          [orderId, idempotency_key],
        );
        if (prior[0]) {
          res.status(200).json(prior[0]);
          return;
        }
      }
      next(err);
    } finally {
      client.release();
    }
  },
);

/** List refunds for an order. Anyone allowed to view the order may view its refunds. */
refundsRouter.get('/:id/refunds', async (req: Request, res: Response) => {
  const user = req.user!;
  const orders = await query<OrderRow>('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  const order = orders[0];
  if (!order) {
    res.status(404).json({ error: 'order_not_found' });
    return;
  }
  if (!canViewOrder(user, order)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  res.json(
    await query<RefundRow>('SELECT * FROM refunds WHERE order_id = $1 ORDER BY created_at DESC', [
      req.params.id,
    ]),
  );
});
