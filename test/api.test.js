import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/http/app.js';
import { createMemoryRepository } from '../src/repositories/memory.js';

describe('REST API (Build 4 + 7 auth)', () => {
  let server;
  let baseUrl;
  let orgToken;
  let attendeeToken;

  before(async () => {
    const repo = createMemoryRepository();
    server = createAppServer({ repository: repo });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Seed an organizer and an attendee
    const org = await json('POST', '/api/auth/signup', {
      body: { email: 'org@test.com', password: 'password1', name: 'Org', role: 'organizer' },
    });
    orgToken = org.data.token;

    const att = await json('POST', '/api/auth/signup', {
      body: { email: 'ada@test.com', password: 'password1', name: 'Ada', role: 'attendee' },
    });
    attendeeToken = att.data.token;
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  async function json(method, path, { body, token } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    return { status: response.status, data };
  }

  it('creates an event, adds a tier and publishes it', async () => {
    const { status, data: event } = await json('POST', '/api/events', {
      token: orgToken,
      body: {
        title: 'Lagos Tech Meetup',
        city: 'Lagos',
        venue: 'Yaba Hub',
        startsAt: '2026-12-05T17:00:00Z',
      },
    });
    assert.equal(status, 201);
    assert.equal(event.status, 'draft');
    assert.ok(event.id);

    const { status: tierStatus, data: tier } = await json('POST', `/api/events/${event.id}/tiers`, {
      token: orgToken,
      body: { name: 'General', priceCents: 500000, capacity: 3 },
    });
    assert.equal(tierStatus, 201);
    assert.equal(tier.sold, 0);

    const { status: pubStatus, data: published } = await json('POST', `/api/events/${event.id}/publish`, {
      token: orgToken,
    });
    assert.equal(pubStatus, 200);
    assert.equal(published.status, 'published');
  });

  it('rejects creating an event without a token', async () => {
    const { status, data } = await json('POST', '/api/events', {
      body: { title: 'Test', city: 'Lagos', startsAt: '2026-12-05T17:00:00Z' },
    });
    assert.equal(status, 401);
    assert.equal(data.error.code, 'UNAUTHENTICATED');
  });

  it('searches published events', async () => {
    const { data: event } = await json('POST', '/api/events', {
      token: orgToken,
      body: {
        title: 'Abuja Jazz Night',
        city: 'Abuja',
        venue: 'National Theatre',
        startsAt: '2026-11-20T19:00:00Z',
      },
    });
    await json('POST', `/api/events/${event.id}/tiers`, {
      token: orgToken,
      body: { name: 'General', priceCents: 200000, capacity: 50 },
    });
    await json('POST', `/api/events/${event.id}/publish`, { token: orgToken });

    const { status, data } = await json('GET', '/api/events?city=Abuja&sort=date');
    assert.equal(status, 200);
    assert.ok(Array.isArray(data));
    assert.ok(data.some((e) => e.title === 'Abuja Jazz Night'));
  });

  it('books tickets, pays successfully, and rejects a second payment', async () => {
    const { data: event } = await json('POST', '/api/events', {
      token: orgToken,
      body: {
        title: 'Pay Test Event',
        city: 'Lagos',
        startsAt: '2026-12-15T18:00:00Z',
      },
    });
    const { data: tier } = await json('POST', `/api/events/${event.id}/tiers`, {
      token: orgToken,
      body: { name: 'General', priceCents: 100000, capacity: 5 },
    });
    await json('POST', `/api/events/${event.id}/publish`, { token: orgToken });

    const { status: bookStatus, data: booking } = await json('POST', '/api/bookings', {
      token: attendeeToken,
      body: { tierId: tier.id, quantity: 2 },
    });
    assert.equal(bookStatus, 201);
    assert.equal(booking.status, 'pending');

    const { status: payStatus, data: paid } = await json('POST', `/api/bookings/${booking.reference}/pay`, {
      token: attendeeToken,
      body: {},
    });
    assert.equal(payStatus, 200);
    assert.equal(paid.status, 'paid');

    const { status: secondPayStatus, data: secondPay } = await json(
      'POST',
      `/api/bookings/${booking.reference}/pay`,
      { token: attendeeToken, body: {} }
    );
    assert.equal(secondPayStatus, 409);
    assert.equal(secondPay.error.code, 'INVALID_TRANSITION');
  });

  it('leaves booking pending when the card is declined', async () => {
    const { data: event } = await json('POST', '/api/events', {
      token: orgToken,
      body: {
        title: 'Decline Test',
        city: 'Lagos',
        startsAt: '2026-12-20T18:00:00Z',
      },
    });
    const { data: tier } = await json('POST', `/api/events/${event.id}/tiers`, {
      token: orgToken,
      body: { name: 'General', priceCents: 50000, capacity: 2 },
    });
    await json('POST', `/api/events/${event.id}/publish`, { token: orgToken });

    const { data: booking } = await json('POST', '/api/bookings', {
      token: attendeeToken,
      body: { tierId: tier.id, quantity: 1 },
    });

    const { status, data } = await json('POST', `/api/bookings/${booking.reference}/pay`, {
      token: attendeeToken,
      body: { decline: true },
    });
    assert.equal(status, 409);
    assert.equal(data.error.code, 'PAYMENT_DECLINED');

    const { data: stillPending } = await json('GET', `/api/bookings/${booking.reference}`, {
      token: attendeeToken,
    });
    assert.equal(stillPending.status, 'pending');
  });

  it('cancels an unpaid booking', async () => {
    const { data: event } = await json('POST', '/api/events', {
      token: orgToken,
      body: {
        title: 'Cancel Test',
        city: 'Lagos',
        startsAt: '2026-12-25T18:00:00Z',
      },
    });
    const { data: tier } = await json('POST', `/api/events/${event.id}/tiers`, {
      token: orgToken,
      body: { name: 'General', priceCents: 100000, capacity: 2 },
    });
    await json('POST', `/api/events/${event.id}/publish`, { token: orgToken });

    const { data: booking } = await json('POST', '/api/bookings', {
      token: attendeeToken,
      body: { tierId: tier.id, quantity: 1 },
    });

    const { status, data: cancelled } = await json('POST', `/api/bookings/${booking.reference}/cancel`, {
      token: attendeeToken,
    });
    assert.equal(status, 200);
    assert.equal(cancelled.status, 'cancelled');
  });

  it('rejects paying for a cancelled booking', async () => {
    const { data: event } = await json('POST', '/api/events', {
      token: orgToken,
      body: {
        title: 'Pay Cancelled Test',
        city: 'Lagos',
        startsAt: '2027-01-05T18:00:00Z',
      },
    });
    const { data: tier } = await json('POST', `/api/events/${event.id}/tiers`, {
      token: orgToken,
      body: { name: 'General', priceCents: 100000, capacity: 2 },
    });
    await json('POST', `/api/events/${event.id}/publish`, { token: orgToken });

    const { data: booking } = await json('POST', '/api/bookings', {
      token: attendeeToken,
      body: { tierId: tier.id, quantity: 1 },
    });
    await json('POST', `/api/bookings/${booking.reference}/cancel`, { token: attendeeToken });

    const { status, data } = await json('POST', `/api/bookings/${booking.reference}/pay`, {
      token: attendeeToken,
      body: {},
    });
    assert.equal(status, 409);
    assert.ok(['INVALID_TRANSITION', 'BOOKING_EXPIRED'].includes(data.error.code));
  });

  it('returns 404 for an unknown booking', async () => {
    const { status, data } = await json('GET', '/api/bookings/DOESNOTEXIST', {
      token: attendeeToken,
    });
    assert.equal(status, 404);
    assert.equal(data.error.code, 'NOT_FOUND');
  });
});
