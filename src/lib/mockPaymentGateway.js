// Mock payment gateway. Never sees a real card number.
import { DomainError } from '../domain/errors.js';

/**
 * Simulate charging a card.
 */
export async function charge({ amountCents, decline = false } = {}) {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new DomainError('VALIDATION', 'amountCents must be a whole number of cents');
  }
  await new Promise((resolve) => setTimeout(resolve, 5));
  if (decline) {
    throw new DomainError('PAYMENT_DECLINED', 'The card was declined');
  }
  return {
    success: true,
    transactionId: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

/**
 * Simulate a refund. Returns the refunded amount.
 */
export async function refund({ amountCents, transactionId } = {}) {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new DomainError('VALIDATION', 'amountCents must be a whole number of cents');
  }
  await new Promise((resolve) => setTimeout(resolve, 5));
  return {
    success: true,
    refundedCents: amountCents,
    transactionId: transactionId || `ref_${Date.now()}`,
  };
}
