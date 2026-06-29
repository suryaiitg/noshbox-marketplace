import { Router } from 'express';
import type { Request, Response } from 'express';
import { query } from '@app/db';
import { requireAuth } from '../auth/middleware';

export const storeCreditRouter = Router();

storeCreditRouter.use(requireAuth);

/** The caller's own store-credit balance: the sum of their ledger entries (integer cents). */
storeCreditRouter.get('/store-credit', async (req: Request, res: Response) => {
  const user = req.user!;
  const rows = await query<{ balance: string }>(
    'SELECT COALESCE(SUM(delta_cents), 0)::bigint AS balance FROM store_credit_ledger WHERE user_id = $1',
    [user.id],
  );
  res.json({ balance_cents: Number(rows[0]?.balance ?? 0) });
});
