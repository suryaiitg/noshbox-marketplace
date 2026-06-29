import { Router } from 'express';
import { query } from '@app/db';
import type { OrderRow } from '@app/db';
import { requireAuth, requireRole } from '../auth/middleware';

export const merchantRouter = Router();

// Everything under /merchant requires an authenticated merchant. Admins are allowed too.
merchantRouter.use(requireAuth, requireRole('merchant', 'admin'));

/** List the calling merchant's orders. An admin may target a merchant via ?merchantId=. */
merchantRouter.get('/orders', async (req, res) => {
  const user = req.user!;
  // A merchant only ever sees their own orders. An admin may target a merchant via ?merchantId=.
  const merchantId =
    user.role === 'admin' && typeof req.query.merchantId === 'string'
      ? req.query.merchantId
      : user.id;
  res.json(
    await query<OrderRow>('SELECT * FROM orders WHERE merchant_id = $1 ORDER BY created_at DESC', [
      merchantId,
    ]),
  );
});
