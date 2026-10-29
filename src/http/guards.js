import { verifyToken } from '../lib/token.js';
import { DomainError } from '../domain/errors.js';

/**
 * Extract and verify the Bearer token. Attaches request.user = { id, role, email }.
 */
export function requireUser(request) {
  const header = request.headers.authorization || request.headers.Authorization;
  if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
    throw new DomainError('UNAUTHENTICATED', 'Authentication required');
  }
  const token = header.slice(7).trim();
  try {
    const payload = verifyToken(token);
    return { id: payload.sub, role: payload.role, email: payload.email };
  } catch (err) {
    throw new DomainError('UNAUTHENTICATED', err.message || 'Invalid token');
  }
}

/**
 * requireUser + role check.
 */
export function requireRole(request, ...roles) {
  const user = requireUser(request);
  if (!roles.includes(user.role)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission for this action');
  }
  return user;
}
