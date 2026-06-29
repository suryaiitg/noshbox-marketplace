import { randomUUID } from 'node:crypto';

/**
 * Mock external payment processor.
 *
 * In production this would be a network call to a real provider. Treat it as real I/O:
 * it can be slow, it can fail, it can time out, and a call can succeed on the provider's
 * side even when you never receive the response. Each call returns a fresh, non-deterministic
 * transaction id, exactly like a real provider would, so you cannot lean on the id to
 * deduplicate retries for you.
 *
 * This mock returns a fake transaction id. To exercise your error handling, you may want
 * to make it fail on demand in your own tests.
 */
export interface CardRefundResult {
  transactionId: string;
}

export async function refundToCard(orderId: string, amountCents: number): Promise<CardRefundResult> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('refundToCard: amountCents must be a positive integer');
  }
  // Simulated provider latency.
  await new Promise((resolve) => setTimeout(resolve, 25));
  return { transactionId: `card_${randomUUID()}` };
}
