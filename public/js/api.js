/**
 * API facade – talks to the real server via fetch.
 * Sends Authorization: Bearer <token> when logged in.
 * Pages must never call fetch themselves.
 */

import { getToken, setSession, clearSession } from './session.js';

const HOLD_SECONDS = 10 * 60;

async function request(method, path, { body, auth = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data?.error?.message || `Request failed (${response.status})`);
    err.code = data?.error?.code || 'ERROR';
    err.status = response.status;
    throw err;
  }
  return data;
}

export async function signup({ email, password, name, role }) {
  const result = await request('POST', '/api/auth/signup', {
    body: { email, password, name, role },
    auth: false,
  });
  setSession(result);
  return result;
}

export async function login({ email, password }) {
  const result = await request('POST', '/api/auth/login', {
    body: { email, password },
    auth: false,
  });
  setSession(result);
  return result;
}

export async function me() {
  return request('GET', '/api/auth/me');
}

export function logout() {
  clearSession();
}

export async function listEvents(criteria = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(criteria)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, v);
  }
  const qs = params.toString();
  return request('GET', `/api/events${qs ? `?${qs}` : ''}`, { auth: false });
}

export async function getEvent(eventId) {
  return request('GET', `/api/events/${encodeURIComponent(eventId)}`, { auth: false });
}

export async function createEvent(data) {
  return request('POST', '/api/events', { body: data });
}

export async function addTier(eventId, data) {
  return request('POST', `/api/events/${encodeURIComponent(eventId)}/tiers`, { body: data });
}

export async function publishEvent(eventId) {
  return request('POST', `/api/events/${encodeURIComponent(eventId)}/publish`);
}

export async function createBooking({ tierId, quantity }) {
  const booking = await request('POST', '/api/bookings', {
    body: { tierId, quantity },
  });
  // Client-side hold timer (server does not yet expire unpaid bookings)
  booking.holdUntil = new Date(Date.now() + HOLD_SECONDS * 1000).toISOString();
  return booking;
}

export async function payBooking(reference, { decline = false } = {}) {
  return request('POST', `/api/bookings/${encodeURIComponent(reference)}/pay`, {
    body: { decline },
  });
}

export async function cancelBooking(reference) {
  return request('POST', `/api/bookings/${encodeURIComponent(reference)}/cancel`);
}

export async function getBooking(reference) {
  return request('GET', `/api/bookings/${encodeURIComponent(reference)}`);
}

export async function myBookings() {
  return request('GET', '/api/my/bookings');
}

export const HOLD_MS = HOLD_SECONDS * 1000;
