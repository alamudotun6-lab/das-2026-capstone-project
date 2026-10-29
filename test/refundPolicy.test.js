import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRefund } from '../src/domain/refundPolicy.js';
import { DomainError } from '../src/domain/errors.js';

const amount = 100_000; // ₦1,000

describe('refund policy', () => {
  it('refunds 100% when 7 days or more remain', () => {
    const startsAt = '2026-12-15T12:00:00.000Z';
    const now = '2026-12-08T12:00:00.000Z'; // exactly 7 days
    assert.equal(calculateRefund({ amountCents: amount, startsAt, now }), amount);
  });

  it('refunds 50% just under 7 days', () => {
    const startsAt = '2026-12-15T12:00:00.000Z';
    const now = '2026-12-08T13:00:00.000Z'; // 6 days 23 hours
    assert.equal(calculateRefund({ amountCents: amount, startsAt, now }), 50_000);
  });

  it('refunds 50% at exactly 2 days', () => {
    const startsAt = '2026-12-15T12:00:00.000Z';
    const now = '2026-12-13T12:00:00.000Z'; // exactly 2 days
    assert.equal(calculateRefund({ amountCents: amount, startsAt, now }), 50_000);
  });

  it('refunds 0% just under 2 days', () => {
    const startsAt = '2026-12-15T12:00:00.000Z';
    const now = '2026-12-13T13:00:00.000Z'; // 1 day 23 hours
    assert.equal(calculateRefund({ amountCents: amount, startsAt, now }), 0);
  });

  it('throws EVENT_STARTED when the event has begun', () => {
    assert.throws(
      () =>
        calculateRefund({
          amountCents: amount,
          startsAt: '2026-12-01T12:00:00.000Z',
          now: '2026-12-01T13:00:00.000Z',
        }),
      (err) => err instanceof DomainError && err.code === 'EVENT_STARTED'
    );
  });

  it('uses Math.floor for odd amounts at 50%', () => {
    assert.equal(
      calculateRefund({
        amountCents: 1001,
        startsAt: '2026-12-15T12:00:00.000Z',
        now: '2026-12-13T12:00:00.000Z',
      }),
      500
    );
  });
});
