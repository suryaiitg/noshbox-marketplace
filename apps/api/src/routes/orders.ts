import { Router } from 'express';
import { query } from '@app/db';
import type { OrderRow } from '@app/db';
import { requireAuth } from '../auth/middleware';
import { canViewOrder } from '../auth/policy';

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

/** An order plus how much of it has been refunded so far (derived, integer cents). */
type OrderWithRefunds = OrderRow & { refunded_cents: number };

/**
 * A line item enriched for display: the at-purchase snapshot (name, unit_price_cents) plus the
 * linked catalog product's category and current active flag (null for legacy free-text items).
 */
interface OrderItemView extends Record<string, unknown> {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price_cents: number;
  category: string | null;
  product_active: boolean | null;
}

type OrderWithItems = OrderWithRefunds & { items: OrderItemView[] };

// Each order carries its total refunded amount so clients can show remaining balance / status
// without a second round-trip. Refunds never exceed the total, so the sum fits in an int.
const ORDER_SELECT = `
  SELECT o.*,
         COALESCE((SELECT SUM(amount_cents) FROM refunds WHERE order_id = o.id), 0)::int AS refunded_cents
  FROM orders o`;

/** Attach line items (with product details) to the given orders in one batched query. */
async function withItems(orders: OrderWithRefunds[]): Promise<OrderWithItems[]> {
  if (orders.length === 0) {
    return [];
  }
  const items = await query<OrderItemView>(
    `SELECT oi.id, oi.order_id, oi.product_id, oi.name, oi.quantity, oi.unit_price_cents,
            p.category, p.active AS product_active
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ANY($1::uuid[])
     ORDER BY oi.id`,
    [orders.map((o) => o.id)],
  );
  const byOrder = new Map<string, OrderItemView[]>();
  for (const item of items) {
    const list = byOrder.get(item.order_id) ?? [];
    list.push(item);
    byOrder.set(item.order_id, list);
  }
  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
}

/** List orders visible to the caller (customer: own; merchant: theirs; admin: all). */
ordersRouter.get('/', async (req, res) => {
  const user = req.user!;
  const orders =
    user.role === 'admin'
      ? await query<OrderWithRefunds>(`${ORDER_SELECT} ORDER BY o.created_at DESC`)
      : await query<OrderWithRefunds>(
          `${ORDER_SELECT} WHERE o.${user.role === 'customer' ? 'customer_id' : 'merchant_id'} = $1 ORDER BY o.created_at DESC`,
          [user.id],
        );
  res.json(await withItems(orders));
});

/** Fetch one order (with its line items), enforcing per-row ownership: 404 if missing, 403 if not yours. */
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
  const [withItemsRow] = await withItems([order]);
  res.json(withItemsRow);
});
