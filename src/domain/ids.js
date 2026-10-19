import { randomBytes, randomUUID } from 'node:crypto';

// Avoid characters that are easy to confuse when read aloud: 0/O and 1/I.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 characters

export function newId() {
  return randomUUID();
}

/** Create a short, readable booking reference using cryptographic randomness. */
export function newReference(length = 8) {
  if (!Number.isInteger(length) || length < 4 || length > 32) {
    throw new RangeError('Reference length must be a whole number between 4 and 32');
  }

  const bytes = randomBytes(length);
  let code = '';
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

// Backwards-compatible alias for the name used in the first draft.
export const referenceCode = newReference;
