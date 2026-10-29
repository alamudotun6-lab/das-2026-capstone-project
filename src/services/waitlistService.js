import { DomainError } from '../domain/errors.js';
import { now } from '../lib/clock.js';

export const OFFER_MS = 5 * 60 * 1000; // 5-minute waitlist offer hold

export function createWaitlistService(repo) {
  return {
    async join({ tierId, userId, quantity }) {
      if (!userId) throw new DomainError('VALIDATION', 'userId is required');
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
        throw new DomainError('VALIDATION', 'quantity must be between 1 and 10');
      }

      const tier = await repo.getTier(tierId);
      if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');

      const seatsLeft = tier.capacity - tier.sold;
      if (seatsLeft >= quantity) {
        throw new DomainError('NOT_SOLD_OUT', 'Seats are available, so book them instead');
      }

      const existing = await repo.findWaitlistEntry(tierId, userId);
      if (existing) {
        throw new DomainError('ALREADY_ON_WAITLIST', 'You are already on the waitlist for this tier');
      }

      return repo.enqueueWaitlist(tierId, { userId, quantity, joinedAt: now().toISOString() });
    },

    /**
     * When seats are freed, offer them to the head of the waitlist if they want
     * a quantity that fits.
     */
    async offerFreedSeats(tierId, freedQuantity) {
      const tier = await repo.getTier(tierId);
      if (!tier) return null;

      // Expire any stale offer first
      await this.expireOffers(tierId);

      const seatsLeft = tier.capacity - tier.sold;
      if (seatsLeft <= 0) return null;

      const head = await repo.peekWaitlist(tierId);
      if (!head) return null;
      if (head.quantity > seatsLeft) return null;

      // Reserve seats for the offer (atomic)
      const reserved = await repo.reserveSeatsForOffer(tierId, head.quantity);
      if (!reserved) return null;

      // Remove from queue and create offer
      await repo.dequeueWaitlist(tierId);
      const offer = {
        tierId,
        userId: head.userId,
        quantity: head.quantity,
        expiresAt: new Date(now().getTime() + OFFER_MS).toISOString(),
        status: 'offered',
      };
      await repo.saveOffer(offer);
      return offer;
    },

    async acceptOffer({ tierId, userId }) {
      const offer = await repo.getOffer(tierId, userId);
      if (!offer || offer.status !== 'offered') {
        throw new DomainError('OFFER_EXPIRED', 'No active offer for this tier');
      }
      if (new Date(offer.expiresAt).getTime() < now().getTime()) {
        await this.expireOffers(tierId);
        throw new DomainError('OFFER_EXPIRED', 'This offer has expired');
      }

      // Convert offer into a pending booking (seats already reserved)
      const booking = await repo.createBookingFromOffer(offer);
      await repo.clearOffer(tierId, userId);
      return booking;
    },

    async expireOffers(tierId) {
      const offers = await repo.listOffersForTier(tierId);
      for (const offer of offers) {
        if (offer.status === 'offered' && new Date(offer.expiresAt).getTime() < now().getTime()) {
          // Release seats and mark expired, then try next person
          await repo.releaseOfferSeats(offer);
          await repo.clearOffer(tierId, offer.userId);
          // Try to offer to the next person
          await this.offerFreedSeats(tierId, offer.quantity);
        }
      }
    },

    async getOffer({ tierId, userId }) {
      return repo.getOffer(tierId, userId);
    },
  };
}
