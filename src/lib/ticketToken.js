// Signed ticket tokens for QR check-in.
// Payload holds only booking reference + issued-at — never name or email.
import { createHmac, timingSafeEqual } from 'node:crypto';

function getTicketSecret() {
  const secret = process.env.TICKET_SECRET;
  if (!secret) {
    // In tests / local dev allow a fallback; production must set the env var
    if (process.env.NODE_ENV === 'production') {
      throw new Error('TICKET_SECRET environment variable is required');
    }
    return 'dev-ticket-secret-change-me';
  }
  return secret;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromB64url(str) {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Sign a ticket for a paid booking.
 * @returns {string} opaque token safe to put in a QR code
 */
export function signTicket({ reference }) {
  if (!reference) throw new Error('reference is required');
  const payload = {
    ref: reference,
    iat: Math.floor(Date.now() / 1000),
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', getTicketSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/**
 * Verify a ticket token. Returns { reference } or throws with code INVALID.
 */
export function verifyTicket(token) {
  if (typeof token !== 'string' || !token.includes('.')) {
    const err = new Error('Invalid ticket token');
    err.code = 'INVALID';
    throw err;
  }
  const [body, sig] = token.split('.');
  if (!body || !sig) {
    const err = new Error('Invalid ticket token');
    err.code = 'INVALID';
    throw err;
  }

  const expected = createHmac('sha256', getTicketSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const err = new Error('Invalid ticket signature');
    err.code = 'INVALID';
    throw err;
  }

  let payload;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    const err = new Error('Invalid ticket payload');
    err.code = 'INVALID';
    throw err;
  }

  if (!payload.ref) {
    const err = new Error('Invalid ticket payload');
    err.code = 'INVALID';
    throw err;
  }

  return { reference: payload.ref, issuedAt: payload.iat };
}
