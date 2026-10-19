// Build 1: the domain core, running entirely in memory.
// No server, no database. Just objects, Maps and rules.
// Build 4 replaces this file with services + repositories.

import { newId, newReference } from './ids.js';
import { Queue } from './waitlistQueue.js';
import { DomainError } from './errors.js';

export const MAX_TICKETS_PER_BOOKING = 10;

// Bookings in these states are holding seats. A cancelled one is not.
const HOLDS_SEATS = new Set(['pending', 'paid']);

export function createStore() {
  return {
    events: new Map(), // eventId -> event
    tiers: new Map(), // tierId -> tier
    bookings: new Map(), // bookingId -> booking
    bookingsByReference: new Map(), // reference -> booking  (hash map = O(1) lookup)
    waitlists: new Map(), // tierId -> Queue
  };
}

function requireStore(store) {
  if (!store || !(store.events instanceof Map) || !(store.tiers instanceof Map) ||
      !(store.bookings instanceof Map) || !(store.bookingsByReference instanceof Map) ||
      !(store.waitlists instanceof Map)) {
    throw new DomainError('VALIDATION', 'A valid store is required');
  }
  return store;
}

function requireObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError('VALIDATION', `${field} must be an object`);
  }
  return value;
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${field} is required`);
  }
  return value.trim();
}

function requireWholeNumber(value, field, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new DomainError('VALIDATION', `${field} must be a whole number of at least ${min}`);
  }
  return value;
}

function getTier(store, tierId) {
  const tier = store.tiers.get(tierId);
  if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
  return tier;
}

export function createEvent(store, input) {
  requireStore(store);
  const { title, city, venue = '', startsAt, organizerId } = requireObject(input, 'Event');
  const validOrganizerId = requireText(organizerId, 'organizerId');
  if (typeof venue !== 'string') throw new DomainError('VALIDATION', 'venue must be text');
  if (startsAt === undefined || startsAt === null || startsAt === '') {
    throw new DomainError('VALIDATION', 'startsAt is required');
  }
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    throw new DomainError('VALIDATION', 'startsAt must be a valid date');
  }
  const event = {
    id: newId(),
    organizerId: validOrganizerId,
    title: requireText(title, 'Title'),
    city: requireText(city, 'City'),
    venue: String(venue).trim(),
    startsAt: date.toISOString(),
    status: 'draft',
    tierIds: [],
  };
  store.events.set(event.id, event);
  return event;
}

export function addTier(store, eventId, input) {
  requireStore(store);
  requireText(eventId, 'eventId');
  const { name, priceCents, capacity } = requireObject(input, 'Ticket tier');
  const event = store.events.get(eventId);
  if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

  const tier = {
    id: newId(),
    eventId,
    name: requireText(name, 'Tier name'),
    // Money is ALWAYS whole cents. 0.1 + 0.2 !== 0.3 in floating point.
    priceCents: requireWholeNumber(priceCents, 'priceCents', 0),
    capacity: requireWholeNumber(capacity, 'capacity', 1),
    sold: 0,
  };
  store.tiers.set(tier.id, tier);
  store.waitlists.set(tier.id, new Queue());
  event.tierIds.push(tier.id);
  return tier;
}

export function seatsLeft(tier) {
  return tier.capacity - tier.sold;
}

export function bookTickets(store, tierId, userId, quantity) {
  requireStore(store);
  requireText(tierId, 'tierId');
  const validUserId = requireText(userId, 'userId');
  const tier = getTier(store, tierId);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
  }

  const left = seatsLeft(tier);
  if (left < quantity) {
    const message = left === 0 ? `${tier.name} is sold out` : `Only ${left} ticket(s) left in ${tier.name}`;
    throw new DomainError('SOLD_OUT', message, { seatsLeft: left });
  }

  tier.sold += quantity;

  let reference;
  do {
    reference = newReference();
  } while (store.bookingsByReference.has(reference));

  const booking = {
    id: newId(),
    reference,
    userId: validUserId,
    tierId,
    quantity,
    amountCents: tier.priceCents * quantity,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  store.bookings.set(booking.id, booking);
  store.bookingsByReference.set(reference, booking);
  return booking;
}

export function findBookingByReference(store, reference) {
  requireStore(store);
  requireText(reference, 'reference');
  return store.bookingsByReference.get(reference);
}

export function cancelBooking(store, reference) {
  requireStore(store);
  requireText(reference, 'reference');

  const booking = findBookingByReference(store, reference);

  if (!booking) {
    throw new DomainError('NOT_FOUND', 'Booking not found');
  }

  if (!HOLDS_SEATS.has(booking.status)) {
    throw new DomainError(
      'INVALID_STATE',
      `A ${booking.status} booking cannot be cancelled`
    );
  }

  const tier = getTier(store, booking.tierId);

  // Release the cancelled booking's seats.
  tier.sold -= booking.quantity;
  booking.status = 'cancelled';

  // Automatically process one eligible waitlist request.
  processNextWaitlistBooking(store, booking.tierId);

  return booking;
}


export function joinWaitlist(store, tierId, userId, quantity) {
  requireStore(store);
  requireText(tierId, 'tierId');
  const validUserId = requireText(userId, 'userId');
  const tier = getTier(store, tierId);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
  }
  if (seatsLeft(tier) >= quantity) {
    throw new DomainError('NOT_SOLD_OUT', 'Seats are available, so book them instead');
  }
  const queue = store.waitlists.get(tierId);
  queue.enqueue({ userId: validUserId, quantity });
  return { position: queue.size };
}

// Strict first-in-first-out: only the person at the head of the line is considered.
// Discussion question for class: what happens if the head wants 4 seats and only 1 is free?
export function offerNextOnWaitlist(store, tierId) {
  requireStore(store);
  requireText(tierId, 'tierId');
  const tier = getTier(store, tierId);
  const queue = store.waitlists.get(tierId);
  const head = queue.peek();
  if (!head || seatsLeft(tier) < head.quantity) return undefined;
  return queue.dequeue();
}
export function processNextWaitlistBooking(store, tierId) {
  requireStore(store);
  requireText(tierId, 'tierId');

  const tier = getTier(store, tierId);
  const queue = store.waitlists.get(tierId);
  const next = queue.peek();

  // Nobody is waiting.
  if (!next) return undefined;

  // Preserve FIFO order if there aren't enough seats.
  if (seatsLeft(tier) < next.quantity) return undefined;

  // Remove the next request from the queue.
  const request = queue.dequeue();

  // Create a booking and reserve the requested seats.
  return bookTickets(store, tierId, request.userId, request.quantity);
}

