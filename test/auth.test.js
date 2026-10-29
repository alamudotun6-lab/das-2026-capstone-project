import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/http/app.js';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { signToken } from '../src/lib/token.js';

describe('Auth and authorization (Build 7)', () => {
  let server;
  let baseUrl;

  before(async () => {
    const repo = createMemoryRepository();
    server = createAppServer({ repository: repo });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  async function json(method, path, { body, token } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  it('signs up a new attendee and returns a token', async () => {
    const { status, data } = await json('POST', '/api/auth/signup', {
      body: {
        email: 'ada@example.com',
        password: 'password1',
        name: 'Ada',
        role: 'attendee',
      },
    });
    assert.equal(status, 201);
    assert.ok(data.token);
    assert.equal(data.user.email, 'ada@example.com');
    assert.equal(data.user.role, 'attendee');
    assert.equal('password' in data.user, false);
    assert.equal('passwordHash' in data.user, false);
  });

  it('rejects a repeated email with EMAIL_TAKEN', async () => {
    await json('POST', '/api/auth/signup', {
      body: { email: 'dup@example.com', password: 'password1', role: 'attendee' },
    });
    const { status, data } = await json('POST', '/api/auth/signup', {
      body: { email: 'dup@example.com', password: 'password1', role: 'attendee' },
    });
    assert.equal(status, 409);
    assert.equal(data.error.code, 'EMAIL_TAKEN');
  });

  it('logs in with correct credentials', async () => {
    await json('POST', '/api/auth/signup', {
      body: { email: 'bayo@example.com', password: 'password1', role: 'attendee' },
    });
    const { status, data } = await json('POST', '/api/auth/login', {
      body: { email: 'bayo@example.com', password: 'password1' },
    });
    assert.equal(status, 200);
    assert.ok(data.token);
  });

  it('rejects wrong password and unknown email with the same code', async () => {
    await json('POST', '/api/auth/signup', {
      body: { email: 'chidi@example.com', password: 'password1', role: 'attendee' },
    });
    const wrong = await json('POST', '/api/auth/login', {
      body: { email: 'chidi@example.com', password: 'wrong-password' },
    });
    const unknown = await json('POST', '/api/auth/login', {
      body: { email: 'nobody@example.com', password: 'password1' },
    });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.data.error.code, 'INVALID_CREDENTIALS');
    assert.equal(unknown.data.error.code, 'INVALID_CREDENTIALS');
    assert.equal(wrong.data.error.message, unknown.data.error.message);
  });

  it('rejects a missing or bad token with UNAUTHENTICATED', async () => {
    const missing = await json('GET', '/api/auth/me');
    assert.equal(missing.status, 401);
    assert.equal(missing.data.error.code, 'UNAUTHENTICATED');

    const bad = await json('GET', '/api/auth/me', { token: 'not.a.token' });
    assert.equal(bad.status, 401);
    assert.equal(bad.data.error.code, 'UNAUTHENTICATED');
  });

  it('rejects an expired token', async () => {
    const token = signToken(
      { sub: 'user-x', role: 'attendee', email: 'x@example.com' },
      { ttlSeconds: -10 }
    );
    const { status, data } = await json('GET', '/api/auth/me', { token });
    assert.equal(status, 401);
    assert.equal(data.error.code, 'UNAUTHENTICATED');
  });

  it('forbids an attendee from creating an event', async () => {
    const { data: signup } = await json('POST', '/api/auth/signup', {
      body: { email: 'attendee-only@example.com', password: 'password1', role: 'attendee' },
    });
    const { status, data } = await json('POST', '/api/events', {
      token: signup.token,
      body: {
        title: 'Should Fail',
        city: 'Lagos',
        startsAt: '2026-12-01T10:00:00Z',
      },
    });
    assert.equal(status, 403);
    assert.equal(data.error.code, 'FORBIDDEN');
  });

  it('prevents one attendee from reading another attendee\'s booking', async () => {
    // organizer + event + tier
    const { data: org } = await json('POST', '/api/auth/signup', {
      body: { email: 'org-priv@example.com', password: 'password1', role: 'organizer' },
    });
    const { data: event } = await json('POST', '/api/events', {
      token: org.token,
      body: { title: 'Private Event', city: 'Lagos', startsAt: '2026-12-01T10:00:00Z' },
    });
    const { data: tier } = await json('POST', `/api/events/${event.id}/tiers`, {
      token: org.token,
      body: { name: 'General', priceCents: 100000, capacity: 5 },
    });
    await json('POST', `/api/events/${event.id}/publish`, { token: org.token });

    const { data: a } = await json('POST', '/api/auth/signup', {
      body: { email: 'alice-priv@example.com', password: 'password1', role: 'attendee' },
    });
    const { data: b } = await json('POST', '/api/auth/signup', {
      body: { email: 'bob-priv@example.com', password: 'password1', role: 'attendee' },
    });

    const { data: booking } = await json('POST', '/api/bookings', {
      token: a.token,
      body: { tierId: tier.id, quantity: 1 },
    });

    // Bob tries to read Alice's booking
    const { status, data } = await json('GET', `/api/bookings/${booking.reference}`, {
      token: b.token,
    });
    assert.equal(status, 404);
    assert.equal(data.error.code, 'NOT_FOUND');
  });
});
