// HS256 JWT-style tokens with node:crypto only.
// Rejects any token whose header says alg is not HS256.
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24 hours

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlJson(obj) {
  return b64url(JSON.stringify(obj));
}

function fromB64url(str) {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function getSecret() {
  const secret = process.env.TOKEN_SECRET || 'dev-only-change-me-in-production';
  return secret;
}

/**
 * Sign a payload. Returns a compact token: header.payload.signature
 */
export function signToken(payload, { ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const h = b64urlJson(header);
  const p = b64urlJson(body);
  const data = `${h}.${p}`;
  const sig = createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Verify and decode a token.
 * Throws DomainError-compatible objects with code UNAUTHENTICATED.
 */
export function verifyToken(token) {
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    const err = new Error('Invalid token');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  const [h, p, s] = token.split('.');
  let header;
  try {
    header = JSON.parse(fromB64url(h).toString('utf8'));
  } catch {
    const err = new Error('Invalid token header');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  if (header.alg !== 'HS256') {
    const err = new Error('Unsupported token algorithm');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  const data = `${h}.${p}`;
  const expected = createHmac('sha256', getSecret()).update(data).digest('base64url');
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const err = new Error('Invalid token signature');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  let payload;
  try {
    payload = JSON.parse(fromB64url(p).toString('utf8'));
  } catch {
    const err = new Error('Invalid token payload');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    const err = new Error('Token expired');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  return payload;
}
