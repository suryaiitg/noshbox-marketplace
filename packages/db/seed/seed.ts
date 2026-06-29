import { getPool, closePool, loadEnv } from '../src/index';

loadEnv();

interface SeedItem {
  name: string;
  quantity: number;
  unit_price_cents: number;
}

async function createOrder(customerId: string, merchantId: string, items: SeedItem[]): Promise<void> {
  const pool = getPool();
  const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price_cents, 0);
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO orders (customer_id, merchant_id, total_cents) VALUES ($1, $2, $3) RETURNING id',
    [customerId, merchantId, total],
  );
  const orderId = rows[0]!.id;
  for (const item of items) {
    await pool.query(
      'INSERT INTO order_items (order_id, name, quantity, unit_price_cents) VALUES ($1, $2, $3, $4)',
      [orderId, item.name, item.quantity, item.unit_price_cents],
    );
  }
}

async function seed(): Promise<void> {
  const pool = getPool();
  await pool.query('TRUNCATE store_credit_ledger, order_items, orders, users RESTART IDENTITY CASCADE');

  const users: ReadonlyArray<{ email: string; role: string }> = [
    { email: 'alice.customer@example.com', role: 'customer' },
    { email: 'dave.customer@example.com', role: 'customer' },
    { email: 'bob.merchant@example.com', role: 'merchant' },
    { email: 'mia.merchant@example.com', role: 'merchant' },
    { email: 'carol.admin@example.com', role: 'admin' },
  ];

  const id = new Map<string, string>();
  for (const u of users) {
    const { rows } = await pool.query<{ id: string }>(
      'INSERT INTO users (email, role) VALUES ($1, $2) RETURNING id',
      [u.email, u.role],
    );
    id.set(u.email, rows[0]!.id);
  }

  const alice = id.get('alice.customer@example.com')!;
  const dave = id.get('dave.customer@example.com')!;
  const bob = id.get('bob.merchant@example.com')!;
  const mia = id.get('mia.merchant@example.com')!;

  await createOrder(alice, bob, [
    { name: 'Margherita Pizza', quantity: 1, unit_price_cents: 1299 },
    { name: 'Garlic Bread', quantity: 2, unit_price_cents: 399 },
  ]);
  await createOrder(alice, mia, [{ name: 'Cold Brew', quantity: 3, unit_price_cents: 450 }]);
  await createOrder(dave, bob, [{ name: 'Veggie Burrito', quantity: 2, unit_price_cents: 899 }]);

  // Alice already holds some store credit from an earlier goodwill gesture.
  await pool.query('INSERT INTO store_credit_ledger (user_id, delta_cents, reason) VALUES ($1, $2, $3)', [
    alice,
    500,
    'signup_bonus',
  ]);

  console.log('Seed complete. Seeded users:');
  for (const u of users) {
    console.log(`  ${u.role.padEnd(9)} ${u.email}`);
  }
  console.log('\nGet a token with:  POST /auth/login  { "email": "<one of the above>" }');
}

seed()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
