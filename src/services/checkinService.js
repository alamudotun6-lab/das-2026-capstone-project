import { verifyTicket } from '../lib/ticketToken.js';
import { assertTransition } from '../domain/bookingStateMachine.js';
import { DomainError } from '../domain/errors.js';
import { now } from '../lib/clock.js';

export function createCheckinService(repo) {
  return {
    /**
     * Check in a ticket by its signed QR token.
     * Optional eventId restricts the ticket to that event.
     */
    async checkIn({ token, eventId, staffId } = {}) {
      if (!token) throw new DomainError('VALIDATION', 'token is required');

      let reference;
      try {
        ({ reference } = verifyTicket(token));
      } catch (err) {
        throw new DomainError('INVALID', err.message || 'Invalid ticket');
      }

      const booking = await repo.findBookingByReference(reference);
      if (!booking) {
        throw new DomainError('INVALID', 'Ticket does not match any booking');
      }

      if (booking.status === 'cancelled' || booking.status === 'refunded') {
        throw new DomainError('INVALID', `Booking is ${booking.status}`);
      }

      if (booking.status === 'checked_in') {
        throw new DomainError('DUPLICATE', 'Ticket already checked in', {
          checkedInAt: booking.checkedInAt,
        });
      }

      if (booking.status !== 'paid') {
        throw new DomainError('INVALID', `Booking is ${booking.status}, not paid`);
      }

      // Optional: restrict to a specific event
      if (eventId) {
        const tier = await repo.getTier(booking.tierId);
        if (!tier || tier.eventId !== eventId) {
          throw new DomainError('INVALID', 'Ticket is for a different event');
        }
      }

      assertTransition('paid', 'checked_in');

      // Atomic compare-and-set so two simultaneous scans admit exactly one
      const checkedInAt = now().toISOString();
      const admitted = await repo.checkInCompareAndSet(reference, 'paid', 'checked_in', {
        checkedInAt,
        checkedInBy: staffId,
      });

      if (!admitted) {
        const again = await repo.findBookingByReference(reference);
        throw new DomainError('DUPLICATE', 'Ticket already checked in', {
          checkedInAt: again?.checkedInAt,
        });
      }

      return {
        reference,
        status: 'checked_in',
        checkedInAt,
        quantity: booking.quantity,
      };
    },
  };
}
