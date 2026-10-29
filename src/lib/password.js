// Password hashing with scrypt (node:crypto). Never store plain text.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const KEYLEN = 64;

/**
 * Hash a password. Returns "salt:hash" (both hex).
 */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored "salt:hash" value.
 * Uses constant-time comparison.
 */
export function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const attempt = scryptSync(password, salt, KEYLEN);
    const expected = Buffer.from(hash, 'hex');
    if (attempt.length !== expected.length) return false;
    return timingSafeEqual(attempt, expected);
  } catch {
    return false;
  }
}
