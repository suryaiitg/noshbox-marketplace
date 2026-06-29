import { describe, it, expect } from 'vitest';
import { formatCents, isValidAmountCents, sumLineItems } from '../domain/money';

describe('formatCents', () => {
  it('formats positive cents', () => {
    expect(formatCents(1234)).toBe('$12.34');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(5)).toBe('$0.05');
  });

  it('formats negative cents', () => {
    expect(formatCents(-99)).toBe('-$0.99');
  });

  it('throws on non-integer input', () => {
    expect(() => formatCents(1.5)).toThrow();
  });
});

describe('isValidAmountCents', () => {
  it('accepts non-negative integers', () => {
    expect(isValidAmountCents(0)).toBe(true);
    expect(isValidAmountCents(100)).toBe(true);
  });

  it('rejects floats, negatives, and non-numbers', () => {
    expect(isValidAmountCents(1.5)).toBe(false);
    expect(isValidAmountCents(-1)).toBe(false);
    expect(isValidAmountCents('5')).toBe(false);
    expect(isValidAmountCents(null)).toBe(false);
  });
});

describe('sumLineItems', () => {
  it('sums quantity * unit price', () => {
    expect(
      sumLineItems([
        { quantity: 2, unit_price_cents: 500 },
        { quantity: 1, unit_price_cents: 250 },
      ]),
    ).toBe(1250);
  });

  it('throws on non-integer inputs', () => {
    expect(() => sumLineItems([{ quantity: 1.5, unit_price_cents: 100 }])).toThrow();
  });
});
