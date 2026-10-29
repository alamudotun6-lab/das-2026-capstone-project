import { now } from '../lib/clock.js';
import { HOLD_MS } from '../services/bookingService.js';

/**
 * Cancel unpaid bookings older than HOLD_MS and release their seats.
 * Then offer freed seats to the waitlist.
 * Tests call this directly; the server runs it on an interval.
 */
export async function runMaintenance({ bookingRepo, waitlistService }) {
  const cutoff = new Date(now().getTime() - HOLD_MS).toISOString();
  const expired = await bookingRepo.findExpiredPendingBookings(cutoff);

  const freedByTier = new Map();

  for (const booking of expired) {
    const released = await bookingRepo.cancelBookingCompareAndSet(
      booking.reference,
      'pending',
      'cancelled',
      { reason: 'expired' }
    );
    if (released) {
      const qty = freedByTier.get(booking.tierId) || 0;
      freedByTier.set(booking.tierId, qty + booking.quantity);
    }
  }

  for (const [tierId, qty] of freedByTier) {
    if (waitlistService) {
      await waitlistService.offerFreedSeats(tierId, qty);
    }
  }

  // Also expire stale waitlist offers
  if (waitlistService && typeof bookingRepo.listTierIdsWithOffers === 'function') {
    const tierIds = await bookingRepo.listTierIdsWithOffers();
    for (const tierId of tierIds) {
      await waitlistService.expireOffers(tierId);
    }
  }

  return { expiredCount: expired.length, freedByTier: Object.fromEntries(freedByTier) };
}
