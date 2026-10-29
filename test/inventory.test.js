import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  createEvent,
  addTier,
  publishEvent,
  listEventSummaries,
  bookTickets,
  cancelBooking,
  seatsLeft,
} from '../src/domain/inventory.js';
import { DomainError } from '../src/domain/errors.js';

describe('inventory – S02 create event', () => {
  it('creates a draft event with a new id', () => {
    const store = createStore();
    const event = createEvent(store, {
      title: 'Lagos Tech Meetup',
      city: 'Lagos',
      venue: 'Yaba Hub',
      startsAt: '2026-12-05T17:00:00Z',
      organizerId: 'org-1',
    });
    assert.ok(event.id);
    assert.equal(event.status, 'draft');
    assert.equal(event.title, 'Lagos Tech Meetup');
  });

  it('rejects missing title with VALIDATION', () => {
    const store = createStore();
    assert.throws(
      () => createEvent(store, { title: '', city: 'Lagos', startsAt: '2026-12-05T17:00:00Z', organizerId: 'org-1' }),
      (err) => err instanceof DomainError && err.code === 'VALIDATION'
    );
  });

  it('rejects invalid date with VALIDATION', () => {
    const store = createStore();
    assert.throws(
      () => createEvent(store, { title: 'Test', city: 'Lagos', startsAt: 'not-a-date', organizerId: 'org-1' }),
      (err) => err instanceof DomainError && err.code === 'VALIDATION'
    );
  });
});

describe('inventory – S03 add tier', () => {
  it('adds a tier with 0 sold', () => {
    const store = createStore();
    const event = createEvent(store, {
      title: 'Test',
      city: 'Lagos',
      startsAt: '2026-12-05T17:00:00Z',
      organizerId: 'org-1',
    });
    const tier = addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 100 });
    assert.equal(tier.sold, 0);
    assert.equal(seatsLeft(tier), 100);
    assert.equal(tier.priceCents, 500000);
  });

  it('rejects non-whole price with VALIDATION', () => {
    const store = createStore();
    const event = createEvent(store, {
      title: 'Test',
      city: 'Lagos',
      startsAt: '2026-12-05T17:00:00Z',
      organizerId: 'org-1',
    });
    assert.throws(
      () => addTier(store, event.id, { name: 'General', priceCents: 10.5, capacity: 100 }),
      (err) => err instanceof DomainError && err.code === 'VALIDATION'
    );
  });

  it('rejects missing event with NOT_FOUND', () => {
    const store = createStore();
    assert.throws(
      () => addTier(store, 'does-not-exist', { name: 'General', priceCents: 500000, capacity: 100 }),
      (err) => err instanceof DomainError && err.code === 'NOT_FOUND'
    );
  });
});

describe('inventory – S04 publish', () => {
  it('publishes an event that has at least one tier', () => {
    const store = createStore();
    const event = createEvent(store, {
      title: 'Test',
      city: 'Lagos',
      startsAt: '2026-12-05T17:00:00Z',
      organizerId: 'org-1',
    });
    addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 50 });
    const published = publishEvent(store, event.id);
    assert.equal(published.status, 'published');
  });

  it('rejects publishing an event with no tiers (INVALID_STATE)', () => {
    const store = createStore();
    const event = createEvent(store, {
      title: 'Test',
      city: 'Lagos',
      startsAt: '2026-12-05T17:00:00Z',
      organizerId: 'org-1',
    });
    assert.throws(
      () => publishEvent(store, event.id),
      (err) => err instanceof DomainError && err.code === 'INVALID_STATE'
    );
  });

  it('hides drafts from the public list', () => {
    const store = createStore();
    const draft = createEvent(store, {
      title: 'Draft Event',
      city: 'Lagos',
      startsAt: '2026-12-05T17:00:00Z',
      organizerId: 'org-1',
    });
    addTier(store, draft.id, { name: 'General', priceCents: 100000, capacity: 10 });

    const published = createEvent(store, {
      title: 'Public Event',
      city: 'Abuja',
      startsAt: '2026-12-06T17:00:00Z',
      organizerId: 'org-1',
    });
    addTier(store, published.id, { name: 'General', priceCents: 200000, capacity: 20 });
    publishEvent(store, published.id);

    const publicList = listEventSummaries(store, { publishedOnly: true });
    assert.equal(publicList.length, 1);
    assert.equal(publicList[0].title, 'Public Event');
  });
});

describe('inventory – booking basics (from Build 1)', () => {
  it('books tickets and reduces seats', () => {
    const store = createStore();
    const event = createEvent(store, {
      title: 'Test',
      city: 'Lagos',
      startsAt: '2026-12-05T17:00:00Z',
      organizerId: 'org-1',
    });
    const tier = addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 3 });
    const booking = bookTickets(store, tier.id, 'user-1', 2);
    assert.equal(booking.quantity, 2);
    assert.equal(booking.status, 'pending');
    assert.equal(seatsLeft(tier), 1);
  });

  it('throws SOLD_OUT when not enough seats', () => {
    const store = createStore();
    const event = createEvent(store, {
      title: 'Test',
      city: 'Lagos',
      startsAt: '2026-12-05T17:00:00Z',
      organizerId: 'org-1',
    });
    const tier = addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 1 });
    assert.throws(
      () => bookTickets(store, tier.id, 'user-1', 2),
      (err) => err instanceof DomainError && err.code === 'SOLD_OUT'
    );
  });

  it('cancels a booking and restores seats', () => {
    const store = createStore();
    const event = createEvent(store, {
      title: 'Test',
      city: 'Lagos',
      startsAt: '2026-12-05T17:00:00Z',
      organizerId: 'org-1',
    });
    const tier = addTier(store, event.id, { name: 'General', priceCents: 500000, capacity: 3 });
    const booking = bookTickets(store, tier.id, 'user-1', 2);
    cancelBooking(store, booking.reference);
    assert.equal(seatsLeft(tier), 3);
  });
});
