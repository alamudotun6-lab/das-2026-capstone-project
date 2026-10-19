import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStore,
  createEvent,
  addTier,
  bookTickets,
  cancelBooking,
  findBookingByReference,
  seatsLeft,
  joinWaitlist,
  offerNextOnWaitlist,
  processNextWaitlistBooking,
} from '../src/domain/inventory.js';

function setup(capacity = 5, priceCents = 2000) {
  const store = createStore();

  const event = createEvent(store, {
    title: 'Tech Conference',
    city: 'Lagos',
    venue: 'Convention Centre',
    startsAt: '2027-06-15T10:00:00Z',
    organizerId: 'organizer-1',
  });

  const tier = addTier(store, event.id, {
    name: 'Standard',
    priceCents,
    capacity,
  });

  return { store, event, tier };
}

test('booking reduces available seats', () => {
  const { store, tier } = setup();

  bookTickets(store, tier.id, 'ada', 2);

  assert.equal(seatsLeft(tier), 3);
});

test('booking calculates the correct amount', () => {
  const { store, tier } = setup();

  const booking = bookTickets(store, tier.id, 'ada', 2);

  assert.equal(booking.amountCents, 4000);
  assert.equal(booking.status, 'pending');
});

test('booking lookup returns the correct booking', () => {
  const { store, tier } = setup();

  const booking = bookTickets(store, tier.id, 'ada', 1);

  assert.equal(
    findBookingByReference(store, booking.reference),
    booking
  );
});

test('booking cannot exceed available inventory', () => {
  const { store, tier } = setup(2);

  bookTickets(store, tier.id, 'ada', 2);

  assert.throws(
    () => bookTickets(store, tier.id, 'chidi', 1),
    { code: 'SOLD_OUT' }
  );

  assert.equal(seatsLeft(tier), 0);
});

test('cancelling a booking releases its seats', () => {
  const { store, tier } = setup();

  const booking = bookTickets(store, tier.id, 'ada', 2);

  cancelBooking(store, booking.reference);

  assert.equal(booking.status, 'cancelled');
  assert.equal(seatsLeft(tier), 5);
});

test('a booking cannot be cancelled twice', () => {
  const { store, tier } = setup();

  const booking = bookTickets(store, tier.id, 'ada', 1);

  cancelBooking(store, booking.reference);

  assert.throws(
    () => cancelBooking(store, booking.reference),
    { code: 'INVALID_STATE' }
  );

  assert.equal(seatsLeft(tier), 5);
});

test('waitlist follows first-in-first-out order', () => {
  const { store, tier } = setup(2);

  bookTickets(store, tier.id, 'ada', 2);

  joinWaitlist(store, tier.id, 'chidi', 1);
  joinWaitlist(store, tier.id, 'ngozi', 1);

  cancelBooking(
    store,
    findBookingByReference(
      store,
      [...store.bookingsByReference.keys()][0]
    ).reference
  );

  const first = offerNextOnWaitlist(store, tier.id);

  assert.equal(first.userId, 'chidi');
});
test('booking rejects zero tickets', () => {
    const { store, tier } = setup();
  
    assert.throws(
      () => bookTickets(store, tier.id, 'ada', 0),
      { code: 'VALIDATION' }
    );
  
    assert.equal(seatsLeft(tier), 5);
  });
  
  test('cancelling a nonexistent booking returns NOT_FOUND', () => {
    const { store } = setup();
  
    assert.throws(
      () => cancelBooking(store, 'NONEXISTENT-REFERENCE'),
      { code: 'NOT_FOUND' }
    );
  });
  
  test('joining the waitlist is rejected when seats are available', () => {
    const { store, tier } = setup();
  
    assert.throws(
      () => joinWaitlist(store, tier.id, 'ada', 1),
      { code: 'NOT_SOLD_OUT' }
    );
  });
  test('processing the waitlist creates a booking and reserves seats', () => {
    const { store, tier } = setup(2);
  
    bookTickets(store, tier.id, 'ada', 2);
    joinWaitlist(store, tier.id, 'chidi', 2);
  
    const adaBooking = [...store.bookingsByReference.values()]
      .find((booking) => booking.userId === 'ada');
  
    cancelBooking(store, adaBooking.reference);
  
    const booking = processNextWaitlistBooking(store, tier.id);
  
    assert.equal(booking.userId, 'chidi');
    assert.equal(booking.quantity, 2);
    assert.equal(booking.status, 'pending');
    assert.equal(seatsLeft(tier), 0);
  });
  
  test('waitlist processing preserves the queue when seats are insufficient', () => {
    const { store, tier } = setup(3);
  
    // Ada books two tickets, leaving one seat.
    const adaBooking = bookTickets(store, tier.id, 'ada', 2);
  
    // Chidi needs two tickets, but only one seat is available.
    joinWaitlist(store, tier.id, 'chidi', 2);
  
    const result = processNextWaitlistBooking(store, tier.id);
  
    assert.equal(result, undefined);
    assert.equal(store.waitlists.get(tier.id).size, 1);
    assert.equal(seatsLeft(tier), 1);
  
    // Cancelling Ada's booking makes all three seats available.
    cancelBooking(store, adaBooking.reference);
  
    const booking = processNextWaitlistBooking(store, tier.id);
  
    assert.equal(booking.userId, 'chidi');
    assert.equal(booking.quantity, 2);
    assert.equal(seatsLeft(tier), 1);
    assert.equal(store.waitlists.get(tier.id).size, 0);
  });
  test('booking rejects a negative ticket quantity', () => {
    const { store, tier } = setup();
  
    assert.throws(
      () => bookTickets(store, tier.id, 'ada', -1),
      { code: 'VALIDATION' }
    );
  
    assert.equal(seatsLeft(tier), 5);
  });
  
  test('booking rejects quantities above the maximum limit', () => {
    const { store, tier } = setup(20);
  
    assert.throws(
      () => bookTickets(store, tier.id, 'ada', 11),
      { code: 'VALIDATION' }
    );
  
    assert.equal(seatsLeft(tier), 20);
  });
  
  test('booking rejects a nonexistent ticket tier', () => {
    const { store } = setup();
  
    assert.throws(
      () => bookTickets(store, 'invalid-tier-id', 'ada', 1),
      { code: 'NOT_FOUND' }
    );
  });
   