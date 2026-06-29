import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { getPool, loadEnv } from '@app/db';
import { authRouter } from './routes/auth';
import { ordersRouter } from './routes/orders';
import { refundsRouter } from './routes/refunds';
import { storeCreditRouter } from './routes/storeCredit';
import { merchantRouter } from './routes/merchant';

loadEnv();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/auth', authRouter);
app.use('/orders', ordersRouter);
app.use('/orders', refundsRouter);
app.use('/me', storeCreditRouter);
app.use('/merchant', merchantRouter);

// Centralized error fallback. Keep this last.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

// Non-fatal connectivity hint so a missing database fails with a clear message.
getPool()
  .query('SELECT 1')
  .catch(() => {
    console.warn(
      '[warn] Could not reach Postgres. Did you run `docker compose up -d` and `pnpm db:migrate`?',
    );
  });

export { app };
