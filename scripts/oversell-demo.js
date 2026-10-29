// Prove the last-ticket race condition is fixed.
// Run with: npm run oversell

import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { DomainError } from '../src/domain/errors.js';

const repo = createSqliteRepository(':memory:');

const event = await repo.createEvent({
  title: 'Last Ticket Race',
  city: 'Lagos',
  startsAt: '2026-12-31T20:00:00Z',
  organizerId: 'organizer-1',
});

const tier = await repo.addTier(event.id, {
  name: 'General',
  priceCents: 100_000,
  capacity: 1,          // only ONE seat
});

await repo.publishEvent(event.id);

console.log(`Event created with capacity 1 (tier ${tier.id})`);
console.log('Firing 50 simultaneous booking attempts...\n');

const attempts = Array.from({ length: 50 }, (_, i) =>
  repo.bookTickets(tier.id, `user-${i}`, 1)
    .then((booking) => ({ ok: true, reference: booking.reference }))
    .catch((err) => ({
      ok: false,
      code: err instanceof DomainError ? err.code : 'ERROR',
    }))
);

const results = await Promise.all(attempts);
const successes = results.filter((r) => r.ok);
const soldOut = results.filter((r) => r.code === 'SOLD_OUT');

const finalTier = await repo.getTier(tier.id);

console.log(`Successful bookings : ${successes.length}`);
console.log(`SOLD_OUT responses  : ${soldOut.length}`);
console.log(`Seats sold in DB    : ${finalTier.sold} / ${finalTier.capacity}`);

if (successes.length === 1 && finalTier.sold === 1) {
  console.log('\n✅ Exactly one booking succeeded. The overselling fix is working.');
} else {
  console.log('\n❌ Overselling detected (or under-selling). Check the atomic UPDATE.');
  process.exitCode = 1;
}
