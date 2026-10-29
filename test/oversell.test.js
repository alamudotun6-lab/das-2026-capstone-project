import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { DomainError } from '../src/domain/errors.js';

describe('overselling fix (S08)', () => {
  it('exactly one of 50 concurrent bookings for the last seat succeeds', async () => {
    const repo = createSqliteRepository(':memory:');

    const event = await repo.createEvent({
      title: 'Race Condition Test',
      city: 'Lagos',
      startsAt: '2026-12-31T20:00:00Z',
      organizerId: 'org-test',
    });
    const tier = await repo.addTier(event.id, {
      name: 'General',
      priceCents: 100000,
      capacity: 1,
    });
    await repo.publishEvent(event.id);

    const attempts = Array.from({ length: 50 }, (_, i) =>
      repo.bookTickets(tier.id, `user-${i}`, 1)
        .then(() => ({ ok: true }))
        .catch((err) => ({
          ok: false,
          code: err instanceof DomainError ? err.code : 'ERROR',
        }))
    );

    const results = await Promise.all(attempts);
    const successes = results.filter((r) => r.ok);
    const soldOut = results.filter((r) => r.code === 'SOLD_OUT');
    const finalTier = await repo.getTier(tier.id);

    assert.equal(successes.length, 1, `expected 1 success, got ${successes.length}`);
    assert.equal(soldOut.length, 49, `expected 49 SOLD_OUT, got ${soldOut.length}`);
    assert.equal(finalTier.sold, 1, `sold must be 1, got ${finalTier.sold}`);
    assert.ok(finalTier.sold <= finalTier.capacity, 'sold must never exceed capacity');
  });
});
