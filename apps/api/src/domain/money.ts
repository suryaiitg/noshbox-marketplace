/**
 * Money is ALWAYS an integer number of cents. Never use floats for money.
 * House helpers for working with cents.
 */

/** True only for non-negative integer cent amounts. */
export function isValidAmountCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Format integer cents as a dollar string, e.g. 1599 -> "$15.99", -99 -> "-$0.99". */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`formatCents expects integer cents, got ${cents}`);
  }
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

/** Sum line items defensively. Throws on non-integer inputs so bad data fails loudly. */
export function sumLineItems(
  items: ReadonlyArray<{ quantity: number; unit_price_cents: number }>,
): number {
  let total = 0;
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || !Number.isInteger(item.unit_price_cents)) {
      throw new Error('line items must use integer cents and integer quantities');
    }
    total += item.quantity * item.unit_price_cents;
  }
  return total;
}
