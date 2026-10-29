// Simple in-memory rate limiter (per process).
// Suitable for the course project; production would use Redis etc.

const buckets = new Map();

/**
 * @param {string} key  e.g. "login:1.2.3.4"
 * @param {{ windowMs: number, max: number }} options
 * @returns {{ allowed: boolean, remaining: number }}
 */
export function rateLimit(key, { windowMs = 60_000, max = 20 } = {}) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const allowed = bucket.count <= max;
  return { allowed, remaining: Math.max(0, max - bucket.count) };
}

/** Reset all buckets (for tests). */
export function resetRateLimits() {
  buckets.clear();
}
