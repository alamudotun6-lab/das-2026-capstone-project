import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { createBookingService, HOLD_MS } from '../src/services/bookingService.js';
import { createWaitlistService } from '../src/services/waitlistService.js';
import { runMaintenance } from '../src/jobs/maintenance.js';
import { setClock, resetClock, advanceClock, now } from '../src/lib/clock.js';
import { DomainError } from '../src/domain/errors.js';

describe('booking lifecycle (Build 8)', () => {
  let repo;
  let waitlistService;
  let bookingService;

  beforeEach(async () => {
    resetClock();
    repo = createMemoryRepository();
    waitlistService = createWaitlistService(repo);
    bookingService = createBookingService(repo, {
      onSeatsFreed: (tierId, qty) => waitlistService.offerFreedSeats(tierId, qty),
    });
  });

  afterEach(() => resetClock());

  async function setupEvent({ startsAt, capacity = 2 } = {}) {
    const event = await repo.createEvent({
      title: 'Test Event',
      city: 'Lagos',
      startsAt: startsAt || '2026-12-20T18:00:00.000Z',
      organizerId: 'org-1',
    });
    const tier = await repo.addTier(event.id, {
      name: 'General',
      priceCents: 100_000,
      capacity,
    });
    await repo.publishEvent(event.id);
    return { event, tier };
  }

  it('cancelling a paid booking 10 days out refunds 100% and releases seats once', async () => {
    setClock(new Date('2026-12-01T12:00:00.000Z'));
    const { tier } = await setupEvent({ startsAt: '2026-12-15T12:00:00.000Z', capacity: 2 });

    const booking = await bookingService.bookTickets({ tierId: tier.id, userId: 'ada', quantity: 1 });
    await bookingService.payBooking(booking.reference, { userId: 'ada' });

    const result = await bookingService.cancelBooking(booking.reference, { userId: 'ada' });
    assert.equal(result.refundCents, 100_000);
    assert.ok(result.status === 'refunded' || result.status === 'cancelled');

    const updatedTier = await repo.getTier(tier.id);
    assert.equal(updatedTier.sold, 0);

    // Cancel again must fail and not release seats twice
    await assert.rejects(
      () => bookingService.cancelBooking(booking.reference, { userId: 'ada' }),
      (err) => err instanceof DomainError && err.code === 'INVALID_TRANSITION'
    );
    assert.equal((await repo.getTier(tier.id)).sold, 0);
  });

  it('cancelling a paid booking 3 days out refunds 50%', async () => {
    setClock(new Date('2026-12-12T12:00:00.000Z'));
    const { tier } = await setupEvent({ startsAt: '2026-12-15T12:00:00.000Z' });
    const booking = await bookingService.bookTickets({ tierId: tier.id, userId: 'ada', quantity: 1 });
    await bookingService.payBooking(booking.reference, { userId: 'ada' });
    const result = await bookingService.cancelBooking(booking.reference, { userId: 'ada' });
    assert.equal(result.refundCents, 50_000);
  });

  it('cancelling a paid booking 1 day out refunds 0% but still releases seats', async () => {
    setClock(new Date('2026-12-14T12:00:00.000Z'));
    const { tier } = await setupEvent({ startsAt: '2026-12-15T12:00:00.000Z' });
    const booking = await bookingService.bookTickets({ tierId: tier.id, userId: 'ada', quantity: 1 });
    await bookingService.payBooking(booking.reference, { userId: 'ada' });
    const result = await bookingService.cancelBooking(booking.reference, { userId: 'ada' });
    assert.equal(result.refundCents, 0);
    assert.equal((await repo.getTier(tier.id)).sold, 0);
  });

  it('expires unpaid bookings and releases seats', async () => {
    setClock(new Date('2026-12-01T12:00:00.000Z'));
    const { tier } = await setupEvent({ capacity: 1 });
    const booking = await bookingService.bookTickets({ tierId: tier.id, userId: 'ada', quantity: 1 });
    assert.equal((await repo.getTier(tier.id)).sold, 1);

    // Advance past hold time
    advanceClock(HOLD_MS + 1000);

    const report = await runMaintenance({ bookingRepo: repo, waitlistService });
    assert.equal(report.expiredCount, 1);
    assert.equal((await repo.getTier(tier.id)).sold, 0);

    await assert.rejects(
      () => bookingService.payBooking(booking.reference, { userId: 'ada' }),
      (err) => err instanceof DomainError && (err.code === 'BOOKING_EXPIRED' || err.code === 'INVALID_TRANSITION')
    );
  });

  it('does not expire paid bookings', async () => {
    setClock(new Date('2026-12-01T12:00:00.000Z'));
    const { tier } = await setupEvent({ capacity: 1 });
    const booking = await bookingService.bookTickets({ tierId: tier.id, userId: 'ada', quantity: 1 });
    await bookingService.payBooking(booking.reference, { userId: 'ada' });

    advanceClock(HOLD_MS + 1000);
    const report = await runMaintenance({ bookingRepo: repo, waitlistService });
    assert.equal(report.expiredCount, 0);
    const still = await repo.findBookingByReference(booking.reference);
    assert.equal(still.status, 'paid');
  });

  it('waitlist: join when sold out, reject when seats remain', async () => {
    const { tier } = await setupEvent({ capacity: 1 });
    await bookingService.bookTickets({ tierId: tier.id, userId: 'ada', quantity: 1 });

    const entry = await waitlistService.join({ tierId: tier.id, userId: 'bayo', quantity: 1 });
    assert.equal(entry.position, 1);

    await assert.rejects(
      () => waitlistService.join({ tierId: tier.id, userId: 'bayo', quantity: 1 }),
      (err) => err.code === 'ALREADY_ON_WAITLIST'
    );

    // New tier with seats
    const { tier: open } = await setupEvent({ capacity: 5 });
    await assert.rejects(
      () => waitlistService.join({ tierId: open.id, userId: 'chidi', quantity: 1 }),
      (err) => err.code === 'NOT_SOLD_OUT'
    );
  });

  it('waitlist: offer goes to the first person when seats free, then next on expiry', async () => {
    setClock(new Date('2026-12-01T12:00:00.000Z'));
    const { tier } = await setupEvent({
      startsAt: '2026-12-20T12:00:00.000Z',
      capacity: 1,
    });

    const booking = await bookingService.bookTickets({ tierId: tier.id, userId: 'holder', quantity: 1 });
    await bookingService.payBooking(booking.reference, { userId: 'holder' });

    await waitlistService.join({ tierId: tier.id, userId: 'first', quantity: 1 });
    await waitlistService.join({ tierId: tier.id, userId: 'second', quantity: 1 });

    // Cancel frees seat → offer to first
    await bookingService.cancelBooking(booking.reference, { userId: 'holder' });

    const offer1 = await waitlistService.getOffer({ tierId: tier.id, userId: 'first' });
    assert.ok(offer1);
    assert.equal(offer1.status, 'offered');
    assert.equal((await repo.getTier(tier.id)).sold, 1); // held by offer

    // Expire the offer
    advanceClock(6 * 60 * 1000); // past 5 min offer window
    await waitlistService.expireOffers(tier.id);

    const offer1Gone = await waitlistService.getOffer({ tierId: tier.id, userId: 'first' });
    assert.equal(offer1Gone, null);

    const offer2 = await waitlistService.getOffer({ tierId: tier.id, userId: 'second' });
    assert.ok(offer2);
    assert.equal(offer2.status, 'offered');
  });
});
