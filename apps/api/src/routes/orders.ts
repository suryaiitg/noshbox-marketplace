import { Router } from 'express';
import { query } from '@app/db';
import type { OrderRow } from '@app/db';
import { requireAuth } from '../auth/middleware';
import { canViewOrder } from '../auth/policy';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

/** An order plus how much of it has been refunded so far (derived, integer cents). */
type OrderWithRefunds = OrderRow & { refunded_cents: number };

// Each order carries its total refunded amount so clients can show remaining balance / status
// without a second round-trip. Refunds never exceed the total, so the sum fits in an int.
const ORDER_SELECT = `
  SELECT o.*,
         COALESCE((SELECT SUM(amount_cents) FROM refunds WHERE order_id = o.id), 0)::int AS refunded_cents
  FROM orders o`;

/** List orders visible to the caller (customer: own; merchant: theirs; admin: all). */
ordersRouter.get('/', async (req, res) => {
  const user = req.user!;
  if (user.role === 'admin') {
    res.json(await query<OrderWithRefunds>(`${ORDER_SELECT} ORDER BY o.created_at DESC`));
    return;
  }
  const column = user.role === 'customer' ? 'customer_id' : 'merchant_id';
  res.json(
    await query<OrderWithRefunds>(
      `${ORDER_SELECT} WHERE o.${column} = $1 ORDER BY o.created_at DESC`,
      [user.id],
    ),
  );
});

/** Fetch one order, enforcing per-row ownership: 404 if missing, 403 if not yours. */
ordersRouter.get('/:id', async (req, res) => {
  const user = req.user!;
  const rows = await query<OrderWithRefunds>(`${ORDER_SELECT} WHERE o.id = $1`, [req.params.id]);
  const order = rows[0];
  if (!order) {
    res.status(404).json({ error: 'order_not_found' });
    return;
  }
  if (!canViewOrder(user, order)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  res.json(order);
});
