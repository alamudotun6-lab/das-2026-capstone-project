import { hashPassword, verifyPassword } from '../lib/password.js';
import { signToken } from '../lib/token.js';
import { DomainError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';

const ALLOWED_ROLES = new Set(['attendee', 'organizer', 'staff']);

export function createAuthService(repo) {
  return {
    async signup({ email, password, name, role = 'attendee' }) {
      if (typeof email !== 'string' || !email.includes('@')) {
        throw new DomainError('VALIDATION', 'A valid email is required');
      }
      if (typeof password !== 'string' || password.length < 8) {
        throw new DomainError('VALIDATION', 'Password must be at least 8 characters');
      }
      if (!ALLOWED_ROLES.has(role)) {
        throw new DomainError('VALIDATION', 'role must be attendee, organizer or staff');
      }

      const existing = await repo.findUserByEmail(email.trim().toLowerCase());
      if (existing) {
        throw new DomainError('EMAIL_TAKEN', 'An account with this email already exists');
      }

      const user = {
        id: newId(),
        email: email.trim().toLowerCase(),
        name: (name || email.split('@')[0]).trim(),
        role,
        passwordHash: hashPassword(password),
      };
      await repo.createUser(user);

      const token = signToken({ sub: user.id, role: user.role, email: user.email });
      return {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      };
    },

    async login({ email, password }) {
      // Same error for unknown email and wrong password
      const user = await repo.findUserByEmail(
        typeof email === 'string' ? email.trim().toLowerCase() : ''
      );
      if (!user || !verifyPassword(password || '', user.passwordHash)) {
        throw new DomainError('INVALID_CREDENTIALS', 'Invalid email or password');
      }

      const token = signToken({ sub: user.id, role: user.role, email: user.email });
      return {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      };
    },

    async me(userId) {
      const user = await repo.findUserById(userId);
      if (!user) throw new DomainError('UNAUTHENTICATED', 'User not found');
      return { id: user.id, email: user.email, name: user.name, role: user.role };
    },
  };
}
