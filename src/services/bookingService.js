import { assertTransition } from '../domain/bookingStateMachine.js';
import { calculateRefund } from '../domain/refundPolicy.js';
import { DomainError } from '../domain/errors.js';
import { charge, refund } from '../lib/mockPaymentGateway.js';
import { signTicket } from '../lib/ticketToken.js';
import { now } from '../lib/clock.js';

export const HOLD_MS = 10 * 60 * 1000; // 10 minutes unpaid hold

export function createBookingService(repo, { onSeatsFreed } = {}) {
  return {
    async bookTickets({ tierId, userId, quantity }) {
      if (!userId) throw new DomainError('VALIDATION', 'userId is required');
      return repo.bookTickets(tierId, userId, quantity);
    },

    async payBooking(reference, { userId, decline = false } = {}) {
      const booking = await repo.findBookingByReference(reference);
      if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');

      if (booking.userId !== userId) {
        throw new DomainError('FORBIDDEN', 'You can only pay for your own bookings');
      }

      if (booking.status === 'cancelled') {
        // Could be an expired hold
        throw new DomainError('BOOKING_EXPIRED', 'This booking has expired or was cancelled');
      }

      assertTransition(booking.status, 'paid');

      await charge({ amountCents: booking.amountCents, decline });

      booking.status = 'paid';
      booking.paidAt = now().toISOString();
      const saved = await repo.saveBooking(booking);
      saved.ticketToken = signTicket({ reference: saved.reference });
      return saved;
    },

    /**
     * Cancel a booking.
     * - pending → cancelled (release seats)
     * - paid → refunded or cancelled with refund amount based on policy
     * Seats are released exactly once via compare-and-set on status.
     */
    async cancelBooking(reference, { userId } = {}) {
      const booking = await repo.findBookingByReference(reference);
      if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');

      if (userId && booking.userId !== userId) {
        throw new DomainError('FORBIDDEN', 'You can only cancel your own bookings');
      }

      if (booking.status === 'cancelled' || booking.status === 'refunded') {
        throw new DomainError(
          'INVALID_TRANSITION',
          `A ${booking.status} booking cannot be cancelled again`
        );
      }

      let refundCents = 0;
      let nextStatus = 'cancelled';

      if (booking.status === 'paid') {
        // Look up event start time for the tier
        const tier = await repo.getTier(booking.tierId);
        if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
        const event = await repo.getEvent(tier.eventId);
        if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

        refundCents = calculateRefund({
          amountCents: booking.amountCents,
          startsAt: event.startsAt,
          now: now(),
        });

        if (refundCents > 0) {
          await refund({ amountCents: refundCents });
          nextStatus = 'refunded';
        } else {
          nextStatus = 'cancelled';
        }
        assertTransition('paid', nextStatus);
      } else {
        assertTransition(booking.status, 'cancelled');
      }

      // Compare-and-set: only release seats if status was still pending/paid
      const released = await repo.cancelBookingCompareAndSet(reference, booking.status, nextStatus, {
        refundCents,
      });
      if (!released) {
        throw new DomainError(
          'INVALID_TRANSITION',
          'Booking was already cancelled or changed'
        );
      }

      if (typeof onSeatsFreed === 'function') {
        await onSeatsFreed(booking.tierId, booking.quantity);
      }

      const updated = await repo.findBookingByReference(reference);
      return { ...updated, refundCents };
    },

    async findBookingByReference(reference) {
      const booking = await repo.findBookingByReference(reference);
      if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
      return booking;
    },

    async listBookingsForUser(userId) {
      return repo.listBookingsForUser(userId);
    },

    /** Preview refund amount without cancelling */
    async previewRefund(reference, { userId } = {}) {
      const booking = await repo.findBookingByReference(reference);
      if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
      if (userId && booking.userId !== userId) {
        throw new DomainError('FORBIDDEN', 'You can only view your own bookings');
      }
      if (booking.status !== 'paid') {
        return { refundCents: 0, status: booking.status };
      }
      const tier = await repo.getTier(booking.tierId);
      const event = await repo.getEvent(tier.eventId);
      const refundCents = calculateRefund({
        amountCents: booking.amountCents,
        startsAt: event.startsAt,
        now: now(),
      });
      return { refundCents, amountCents: booking.amountCents, status: booking.status };
    },
  };
}
