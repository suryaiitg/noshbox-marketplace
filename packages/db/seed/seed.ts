import { getPool, closePool, loadEnv } from '../src/index';

loadEnv();

interface SeedUser {
  handle: string;
  email: string;
  role: 'customer' | 'merchant' | 'admin';
}

interface SeedProduct {
  handle: string;
  merchant: string; // user handle of the owning merchant
  name: string;
  category: string;
  price_cents: number;
  active?: boolean;
}

/** A line item expressed against the catalog; name/price are snapshotted from the product. */
interface OrderItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

const users: ReadonlyArray<SeedUser> = [
  { handle: 'alice', email: 'alice.customer@example.com', role: 'customer' },
  { handle: 'dave', email: 'dave.customer@example.com', role: 'customer' },
  { handle: 'eve', email: 'eve.customer@example.com', role: 'customer' },
  { handle: 'grace', email: 'grace.customer@example.com', role: 'customer' },
  { handle: 'bob', email: 'bob.merchant@example.com', role: 'merchant' },
  { handle: 'mia', email: 'mia.merchant@example.com', role: 'merchant' },
  { handle: 'carol', email: 'carol.admin@example.com', role: 'admin' },
];

const products: ReadonlyArray<SeedProduct> = [
  // Bob's Kitchen
  { handle: 'margherita', merchant: 'bob', name: 'Margherita Pizza', category: 'Pizza', price_cents: 1299 },
  { handle: 'pepperoni', merchant: 'bob', name: 'Pepperoni Pizza', category: 'Pizza', price_cents: 1499 },
  { handle: 'garlic_bread', merchant: 'bob', name: 'Garlic Bread', category: 'Sides', price_cents: 399 },
  { handle: 'veggie_burrito', merchant: 'bob', name: 'Veggie Burrito', category: 'Mains', price_cents: 899 },
  { handle: 'tiramisu', merchant: 'bob', name: 'Tiramisu', category: 'Dessert', price_cents: 599 },
  { handle: 'pumpkin_pizza', merchant: 'bob', name: 'Seasonal Pumpkin Pizza', category: 'Pizza', price_cents: 1599, active: false },
  // Mia's Coffee
  { handle: 'cold_brew', merchant: 'mia', name: 'Cold Brew', category: 'Coffee', price_cents: 450 },
  { handle: 'cappuccino', merchant: 'mia', name: 'Cappuccino', category: 'Coffee', price_cents: 400 },
  { handle: 'latte', merchant: 'mia', name: 'Latte', category: 'Coffee', price_cents: 425 },
  { handle: 'muffin', merchant: 'mia', name: 'Blueberry Muffin', category: 'Bakery', price_cents: 350 },
  { handle: 'avo_toast', merchant: 'mia', name: 'Avocado Toast', category: 'Food', price_cents: 750 },
  { handle: 'psl', merchant: 'mia', name: 'Pumpkin Spice Latte', category: 'Coffee', price_cents: 525, active: false },
];

interface ProductInfo {
  id: string;
  name: string;
  price_cents: number;
}

async function seed(): Promise<void> {
  const pool = getPool();
  await pool.query(
    'TRUNCATE refunds, store_credit_ledger, order_items, orders, products, users RESTART IDENTITY CASCADE',
  );

  const userId = new Map<string, string>();
  for (const u of users) {
    const { rows } = await pool.query<{ id: string }>(
      'INSERT INTO users (email, role) VALUES ($1, $2) RETURNING id',
      [u.email, u.role],
    );
    userId.set(u.handle, rows[0]!.id);
  }

  const product = new Map<string, ProductInfo>();
  for (const p of products) {
    const { rows } = await pool.query<{ id: string }>(
      'INSERT INTO products (merchant_id, name, category, price_cents, active) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId.get(p.merchant)!, p.name, p.category, p.price_cents, p.active ?? true],
    );
    product.set(p.handle, { id: rows[0]!.id, name: p.name, price_cents: p.price_cents });
  }

  /** Build a line item from a catalog handle, snapshotting the current name and price. */
  function item(handle: string, quantity: number): OrderItem {
    const p = product.get(handle)!;
    return { product_id: p.id, name: p.name, quantity, unit_price_cents: p.price_cents };
  }

  async function createOrder(
    customer: string,
    merchant: string,
    status: 'completed' | 'cancelled',
    items: OrderItem[],
  ): Promise<string> {
    const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price_cents, 0);
    const { rows } = await pool.query<{ id: string }>(
      'INSERT INTO orders (customer_id, merchant_id, total_cents, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId.get(customer)!, userId.get(merchant)!, total, status],
    );
    const orderId = rows[0]!.id;
    for (const it of items) {
      await pool.query(
        'INSERT INTO order_items (order_id, product_id, name, quantity, unit_price_cents) VALUES ($1, $2, $3, $4, $5)',
        [orderId, it.product_id, it.name, it.quantity, it.unit_price_cents],
      );
    }
    return orderId;
  }

  // Alice: repeat coffee buyer at Mia, plus a pizza order at Bob.
  await createOrder('alice', 'mia', 'completed', [item('cold_brew', 2)]);
  await createOrder('alice', 'mia', 'completed', [item('cold_brew', 1), item('muffin', 1)]);
  await createOrder('alice', 'mia', 'completed', [item('latte', 1)]);
  const aliceBobOrder = await createOrder('alice', 'bob', 'completed', [
    item('margherita', 1),
    item('garlic_bread', 2),
  ]);

  // Dave: pizza buyer at Bob, one coffee at Mia.
  await createOrder('dave', 'bob', 'completed', [item('pepperoni', 1), item('garlic_bread', 1)]);
  await createOrder('dave', 'bob', 'completed', [item('margherita', 1)]);
  await createOrder('dave', 'mia', 'completed', [item('cappuccino', 1)]);

  // Eve: mixed history across both merchants.
  await createOrder('eve', 'bob', 'completed', [item('veggie_burrito', 2)]);
  await createOrder('eve', 'mia', 'completed', [item('avo_toast', 1), item('latte', 1)]);

  // A cancelled order (should be excluded from preference signals).
  await createOrder('alice', 'bob', 'cancelled', [item('tiramisu', 1)]);

  // Grace: a single co-purchase at Mia.
  await createOrder('grace', 'mia', 'completed', [item('cold_brew', 1), item('cappuccino', 1)]);

  // Existing goodwill credit for Alice.
  await pool.query(
    'INSERT INTO store_credit_ledger (user_id, delta_cents, reason) VALUES ($1, $2, $3)',
    [userId.get('alice')!, 500, 'signup_bonus'],
  );

  // A real partial refund on Alice's Bob order (1x Garlic Bread = 399), mirroring the refunds flow:
  // one positive ledger entry to the customer, linked from a refunds row created by the merchant.
  const refundCents = 399;
  const ledger = await pool.query<{ id: string }>(
    'INSERT INTO store_credit_ledger (user_id, delta_cents, reason) VALUES ($1, $2, $3) RETURNING id',
    [userId.get('alice')!, refundCents, 'refund'],
  );
  await pool.query(
    `INSERT INTO refunds (order_id, amount_cents, reason, created_by, ledger_entry_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [aliceBobOrder, refundCents, 'merchant_refund', userId.get('bob')!, ledger.rows[0]!.id],
  );

  console.log('Seed complete.');
  console.log(`  users:    ${users.length}`);
  console.log(`  products: ${products.length} (2 inactive)`);
  console.log('  orders:   11 (1 cancelled), with 1 partial refund (399c) to alice');
  console.log('\nSeeded users:');
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
