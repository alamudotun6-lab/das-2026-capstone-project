import { DomainError } from './errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calculate refund amount in whole cents.
 * - 7 days or more before start → 100%
 * - 2 days or more before start → 50%
 * - under 2 days → 0%
 * Exact boundaries belong to the better tier.
 * Event that has started → EVENT_STARTED.
 */
export function calculateRefund({ amountCents, startsAt, now }) {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new DomainError('VALIDATION', 'amountCents must be a whole number of cents');
  }

  const start = new Date(startsAt).getTime();
  const current = new Date(now).getTime();
  if (Number.isNaN(start) || Number.isNaN(current)) {
    throw new DomainError('VALIDATION', 'startsAt and now must be valid dates');
  }

  const msUntil = start - current;
  if (msUntil <= 0) {
    throw new DomainError('EVENT_STARTED', 'The event has already started');
  }

  const daysUntil = msUntil / DAY_MS;

  if (daysUntil >= 7) {
    return amountCents; // 100%
  }
  if (daysUntil >= 2) {
    return Math.floor(amountCents * 0.5); // 50%
  }
  return 0; // under 2 days
}
