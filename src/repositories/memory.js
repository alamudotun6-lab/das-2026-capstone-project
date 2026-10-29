// In-memory repository. Services receive this object; they never import it.
// Later builds swap this for a SQLite repository with the same method names.

import {
  createStore,
  createEvent as domainCreateEvent,
  addTier as domainAddTier,
  publishEvent as domainPublishEvent,
  listEventSummaries as domainListEventSummaries,
  bookTickets as domainBookTickets,
  findBookingByReference as domainFindBookingByReference,
  cancelBooking as domainCancelBooking,
  joinWaitlist as domainJoinWaitlist,
  offerNextOnWaitlist as domainOfferNextOnWaitlist,
  seatsLeft,
} from '../domain/inventory.js';

export function createMemoryRepository() {
  const store = createStore();
  const usersById = new Map();
  const usersByEmail = new Map();

  return {
    // ---- users (Build 7) ----
    async createUser(user) {
      usersById.set(user.id, user);
      usersByEmail.set(user.email, user);
      return user;
    },
    async findUserById(id) {
      return usersById.get(id) ?? null;
    },
    async findUserByEmail(email) {
      return usersByEmail.get(email) ?? null;
    },

    // ---- events ----
    async createEvent(data) {
      return domainCreateEvent(store, data);
    },

    async addTier(eventId, data) {
      return domainAddTier(store, eventId, data);
    },

    async publishEvent(eventId) {
      return domainPublishEvent(store, eventId);
    },

    async listEventSummaries(options) {
      return domainListEventSummaries(store, options);
    },

    async getEvent(eventId) {
      return store.events.get(eventId) ?? null;
    },

    async getTier(tierId) {
      return store.tiers.get(tierId) ?? null;
    },

    async getTiersForEvent(eventId) {
      const event = store.events.get(eventId);
      if (!event) return [];
      return event.tierIds.map((id) => store.tiers.get(id)).filter(Boolean);
    },

    // ---- bookings ----
    async bookTickets(tierId, userId, quantity) {
      return domainBookTickets(store, tierId, userId, quantity);
    },

    async findBookingByReference(reference) {
      return domainFindBookingByReference(store, reference) ?? null;
    },

    async cancelBooking(reference) {
      return domainCancelBooking(store, reference);
    },

    async saveBooking(booking) {
      // Used by the service after a status change (e.g. pending → paid)
      store.bookings.set(booking.id, booking);
      store.bookingsByReference.set(booking.reference, booking);
      return booking;
    },

    async joinWaitlist(tierId, userId, quantity) {
      return domainJoinWaitlist(store, tierId, userId, quantity);
    },

    async offerNextOnWaitlist(tierId) {
      return domainOfferNextOnWaitlist(store, tierId);
    },

    async listBookingsForUser(userId) {
      return [...store.bookings.values()].filter((b) => b.userId === userId);
    },


    async cancelBookingCompareAndSet(reference, expectedStatus, nextStatus, extra = {}) {
      const booking = store.bookingsByReference.get(reference);
      if (!booking || booking.status !== expectedStatus) return false;
      // Release seats only once
      const tier = store.tiers.get(booking.tierId);
      if (tier && (expectedStatus === 'pending' || expectedStatus === 'paid')) {
        tier.sold = Math.max(0, tier.sold - booking.quantity);
      }
      booking.status = nextStatus;
      if (extra.refundCents !== undefined) booking.refundCents = extra.refundCents;
      if (extra.reason) booking.cancelReason = extra.reason;
      store.bookings.set(booking.id, booking);
      store.bookingsByReference.set(reference, booking);
      return true;
    },

    async findExpiredPendingBookings(cutoffIso) {
      return [...store.bookings.values()].filter(
        (b) => b.status === 'pending' && b.createdAt < cutoffIso
      );
    },

    // ---- waitlist (in-memory) ----
    async enqueueWaitlist(tierId, entry) {
      let q = store.waitlists.get(tierId);
      if (!q) {
        // Tier should already have a queue from addTier; create one if missing
        const { Queue } = await import('../domain/waitlistQueue.js');
        q = new Queue();
        store.waitlists.set(tierId, q);
      }
      q.enqueue(entry);
      return { position: q.size, ...entry };
    },

    async findWaitlistEntry(tierId, userId) {
      const q = store.waitlists.get(tierId);
      if (!q) return null;
      return q.toArray().find((e) => e.userId === userId) || null;
    },

    async peekWaitlist(tierId) {
      const q = store.waitlists.get(tierId);
      return q ? q.peek() : undefined;
    },

    async dequeueWaitlist(tierId) {
      const q = store.waitlists.get(tierId);
      return q ? q.dequeue() : undefined;
    },

    async reserveSeatsForOffer(tierId, quantity) {
      const tier = store.tiers.get(tierId);
      if (!tier) return false;
      if (tier.sold + quantity > tier.capacity) return false;
      tier.sold += quantity;
      return true;
    },

    async saveOffer(offer) {
      if (!store.offers) store.offers = new Map();
      store.offers.set(`${offer.tierId}:${offer.userId}`, offer);
      return offer;
    },

    async getOffer(tierId, userId) {
      if (!store.offers) return null;
      return store.offers.get(`${tierId}:${userId}`) || null;
    },

    async clearOffer(tierId, userId) {
      if (store.offers) store.offers.delete(`${tierId}:${userId}`);
    },

    async listOffersForTier(tierId) {
      if (!store.offers) return [];
      return [...store.offers.values()].filter((o) => o.tierId === tierId);
    },

    async listTierIdsWithOffers() {
      if (!store.offers) return [];
      return [...new Set([...store.offers.values()].map((o) => o.tierId))];
    },

    async releaseOfferSeats(offer) {
      const tier = store.tiers.get(offer.tierId);
      if (tier) tier.sold = Math.max(0, tier.sold - offer.quantity);
    },

    async createBookingFromOffer(offer) {
      const { newId, referenceCode } = await import('../domain/ids.js');
      const tier = store.tiers.get(offer.tierId);
      let reference;
      do { reference = referenceCode(); } while (store.bookingsByReference.has(reference));
      const booking = {
        id: newId(),
        reference,
        userId: offer.userId,
        tierId: offer.tierId,
        quantity: offer.quantity,
        amountCents: tier.priceCents * offer.quantity,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      store.bookings.set(booking.id, booking);
      store.bookingsByReference.set(reference, booking);
      return booking;
    },


    async checkInCompareAndSet(reference, expectedStatus, nextStatus, extra = {}) {
      const booking = store.bookingsByReference.get(reference);
      if (!booking || booking.status !== expectedStatus) return false;
      booking.status = nextStatus;
      if (extra.checkedInAt) booking.checkedInAt = extra.checkedInAt;
      if (extra.checkedInBy) booking.checkedInBy = extra.checkedInBy;
      store.bookings.set(booking.id, booking);
      store.bookingsByReference.set(reference, booking);
      return true;
    },

    // Exposed for tests / diagnostics only
    _store: store,
    seatsLeft,
  };
}
