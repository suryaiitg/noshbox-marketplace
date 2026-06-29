- The feature: the marketplace has orders but no concept of a refund. Build one. A merchant (or an admin) can refund one of their orders, and a refund issues store credit to the customer (a positive entry in the existing store_credit_ledger; a customer's balance is the sum of their ledger entries). The data model, API, rules, and any UI are yours to design. The README covers the house conventions (money in integer cents, forward-only migrations, server-side authorization).

---

# Refunds — Design (no code yet)

## 1. Key framing decisions

1. **A refund = store credit, which is purely internal.** Issuing credit is a write to
   `store_credit_ledger`. There is no external system in the critical path, so the whole
   operation can be a single Postgres transaction with full ACID guarantees. This sidesteps the
   hard distributed-systems problems entirely.
2. **`refundToCard` is intentionally a trap and is NOT used by the core feature.** Its docblock
   says it is slow/flaky, can succeed without returning, and returns a fresh `transactionId` every
   call (so you can't dedupe on it). None of that matters when the refund is store credit. I treat
   card refunds only as an optional extension (Section 9) and keep them out of the main path.
3. **Match house conventions:** integer cents everywhere (`domain/money.ts`), pure authorization
   functions (`auth/policy.ts`), zod validation at the HTTP boundary, per-row ownership checks,
   forward-only numbered migrations, and DB transactions via `getClient()` from `@app/db`.

## 2. Data model — three options

### Option A — Ledger-only (minimal)
Just insert a positive `store_credit_ledger` row with `reason = 'refund:<orderId>'`.

- Pros: zero new tables; smallest diff.
- Cons: no first-class refund record; can't cleanly answer "how much has this order been refunded?"
  (you'd parse `reason` strings); no natural place to enforce "don't over-refund"; no idempotency
  anchor; weak audit. Encodes data in a free-text column — against "constrain your tables sensibly".

**Rejected** as the primary design. Too lossy for a money feature.

### Option B — `refunds` table + ledger entry (RECOMMENDED)
A first-class `refunds` row is the source of truth; it points at the ledger entry it created.

```sql
-- 002_refunds.sql  (forward-only)
CREATE TABLE refunds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id),
  amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
  reason           TEXT NOT NULL,
  created_by       UUID NOT NULL REFERENCES users(id),   -- the merchant/admin who issued it
  ledger_entry_id  UUID NOT NULL REFERENCES store_credit_ledger(id),
  idempotency_key  TEXT,                                 -- client-supplied; see Section 6
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX refunds_order_id_idx ON refunds (order_id);

-- Idempotency: at most one refund per (order, key). Partial unique index so NULL keys are allowed.
CREATE UNIQUE INDEX refunds_order_idempotency_uniq
  ON refunds (order_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

The matching `store_credit_ledger` insert is `(user_id = order.customer_id, delta_cents =
+amount, reason = 'refund')`, written in the SAME transaction as the `refunds` row.

- Pros: clean audit trail (who/when/why/how-much), trivial "refunded so far" = `SUM(amount_cents)`,
  natural home for idempotency, supports partial refunds, ledger stays the single balance source.
- Cons: one extra table (acceptable and idiomatic here).

### Option C — Option B + order status
Add a `refunded` (and/or `partially_refunded`) state to `orders.status`. Because the current CHECK
constraint is `('completed','cancelled')`, this needs a forward-only migration that drops and
recreates the constraint with the new values.

- Use only if the UI/business needs an order-level status badge. Otherwise derive "is it refunded?"
  from `SUM(refunds.amount_cents)` vs `orders.total_cents` and avoid duplicating state.
- **Recommendation:** start with B; add C's status only if a real consumer needs it (avoid storing
  derivable state that can drift).

## 3. Refund amount rules (full vs partial)

Decide explicitly; I recommend **supporting partial refunds** because it's barely more work and is
the realistic case.

- `amount_cents` must be a positive integer (`isValidAmountCents` rejects 0; refunds need `> 0`).
- Let `already = SUM(refunds.amount_cents) for the order`. Enforce `amount_cents <= total_cents -
  already`. Over-refunding is the central money bug to prevent.
- If `amount_cents` is omitted in the request, default to a **full refund of the remaining**
  balance (`total_cents - already`).
- Pure helper (mirrors `domain/money.ts` style, unit-testable without a DB):
  `maxRefundableCents(order, alreadyRefundedCents)` and
  `validateRefundAmount(requested, order, alreadyRefunded)`.

## 4. Authorization

Add a pure function next to `canViewOrder` in `auth/policy.ts`:

```ts
// admin: any order. merchant: only orders where order.merchant_id === user.id.
// customer: never (they receive credit, they don't issue refunds).
export function canRefundOrder(user: Principal, order: OrderRef): boolean
```

- Enforced server-side, per row (404 if order missing, 403 if not the merchant's own / not admin).
- Route is gated with `requireAuth` + `requireRole('merchant','admin')`, then the per-row
  `canRefundOrder` check — same layered pattern as the existing routes.

## 5. API surface

Treat refunds as a sub-resource of an order (REST-friendly, easy ownership checks):

| Method | Path | Who | Body | Returns |
|---|---|---|---|---|
| `POST` | `/orders/:id/refunds` | merchant (own) / admin | `{ amount_cents?: number, reason?: string, idempotency_key?: string }` | `201` refund record |
| `GET`  | `/orders/:id/refunds` | viewers of the order | – | refunds for the order |
| `GET`  | `/me/store-credit` (or `/customers/:id/balance`) | self / admin | – | `{ balance_cents }` = `SUM(delta_cents)` |

- Validate the body with zod (like `auth.ts`): `amount_cents` optional positive int, `reason`
  optional non-empty string (default e.g. `"merchant_refund"`), `idempotency_key` optional string.
- Error shape stays consistent with the app: `{ error: 'order_not_found' | 'forbidden' |
  'invalid_body' | 'refund_exceeds_total' | 'order_not_refundable' }`.
- Place handlers in a new `routes/refunds.ts` mounted under the orders path, or extend
  `ordersRouter` — either matches the current structure.

## 6. Concurrency & idempotency (the part that actually matters)

Even though there's no external call, two concurrent refund requests could each read "remaining =
$10" and both succeed, over-refunding. Guard with BOTH of:

1. **Transaction + row lock.** In one `getClient()` transaction:
   `BEGIN` → `SELECT ... FROM orders WHERE id=$1 FOR UPDATE` → compute already-refunded →
   validate `amount <= remaining` → `INSERT store_credit_ledger` → `INSERT refunds` (referencing
   the ledger id) → `COMMIT` (ROLLBACK on any error). `FOR UPDATE` serializes concurrent refunds
   for the same order.
2. **Idempotency key.** Client may send `idempotency_key`; the partial unique index
   `(order_id, idempotency_key)` makes a retried request a no-op (catch unique-violation and return
   the existing refund). This makes the endpoint safe to retry without double-crediting.

This is the correct analogue of the warning in `paymentProcessor.ts`, but solved with DB
constraints instead of trusting a provider id.

## 7. Edge cases to cover

- Refund on a `cancelled` order — decide policy (likely allowed only on `completed`; return
  `order_not_refundable` otherwise).
- `amount_cents = 0` or negative or non-integer → `invalid_body`.
- Cumulative partial refunds that would exceed `total_cents` → `refund_exceeds_total`.
- Refund of an already-fully-refunded order → `refund_exceeds_total` (remaining is 0).
- Non-existent order id → `404`; someone else's order → `403` (don't leak existence to merchants —
  return 404 for "not your order" if you want to avoid enumeration; pick one and be consistent).
- Concurrent duplicate submit (double-click) → idempotency key / row lock makes it safe.

## 8. Testing strategy (matches the shipped, DB-free tests)

- **Pure unit tests** (no DB, like `money.test.ts` / `policy.test.ts`):
  `canRefundOrder` for each role+ownership combo; `maxRefundableCents` /
  `validateRefundAmount` boundaries (0, exact remaining, over by 1 cent, full-default).
- **Integration tests** (documented as DB-backed, per README): happy-path refund credits the
  customer; partial then full; over-refund rejected; idempotency-key replay returns same refund and
  doesn't double-credit; authorization 403/404.
- **Web**: render test for the refund control + balance display with a mocked client (mirrors
  `OrdersList.test.tsx`).

## 9. UI (apps/web)

- **Merchant order view:** a "Refund" action (amount input defaulting to remaining, optional
  reason) calling `POST /orders/:id/refunds`; disable when remaining is 0; surface errors via the
  existing `ApiError` flow.
- **Customer view:** show store-credit balance (`GET /me/store-credit`) using the `<Money />`
  component; optionally show refund entries from the ledger.
- Reuse `apiFetch`, the `useOrders` pattern (e.g. a `useStoreCredit` hook), and `formatCents`.

## 10. Optional extension — refund to card (only if asked)

If money must go back to the card instead of (or in addition to) store credit, THEN
`refundToCard` matters and you must handle: persist a `pending` refund first, call the provider,
and reconcile on the unreliable response. Use the client `idempotency_key` as the dedupe anchor
(never the returned `transactionId`, which changes per call), and add a `status`
(`pending|succeeded|failed`) + `provider_txn_id` to `refunds`. Keep this out of v1 — the spec asks
for store credit, which is the clean, atomic path.

## Recommended v1
Option B (`refunds` table + ledger entry) · partial refunds supported · `POST /orders/:id/refunds`
with zod validation · `canRefundOrder` pure policy · transaction with `SELECT ... FOR UPDATE` +
optional idempotency key · pure-function unit tests + documented DB integration tests · minimal
merchant refund button and customer balance in the UI. No external payment call.
