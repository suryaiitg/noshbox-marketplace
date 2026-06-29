import { Pool } from 'pg';
import type { PoolClient } from 'pg';

export { loadEnv } from './env';

let pool: Pool | null = null;

/** Lazily-created shared connection pool. Reads DATABASE_URL from the environment. */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Copy .env.example to .env and start Postgres (see README).');
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

/** Run a parameterized query and return the rows. Always use $1, $2, ... placeholders. */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as unknown[]);
  return result.rows;
}

/** Check out a client for a transaction. Remember to release() it in a finally block. */
export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ---------------------------------------------------------------------------
// Row types. Keep these in sync with the SQL migrations.
// ---------------------------------------------------------------------------

export type Role = 'customer' | 'merchant' | 'admin';

export interface UserRow extends Record<string, unknown> {
  id: string;
  email: string;
  role: Role;
  created_at: string;
}

export interface OrderRow extends Record<string, unknown> {
  id: string;
  customer_id: string;
  merchant_id: string;
  total_cents: number;
  status: 'completed' | 'cancelled';
  created_at: string;
}

export interface OrderItemRow extends Record<string, unknown> {
  id: string;
  order_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

export interface LedgerRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  delta_cents: number;
  reason: string;
  created_at: string;
}

export interface RefundRow extends Record<string, unknown> {
  id: string;
  order_id: string;
  amount_cents: number;
  reason: string;
  created_by: string;
  ledger_entry_id: string;
  idempotency_key: string | null;
  created_at: string;
}
