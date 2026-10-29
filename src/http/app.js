import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DomainError } from '../domain/errors.js';
import { Router } from './router.js';
import { registerRoutes } from './routes.js';
import { createMemoryRepository } from '../repositories/memory.js';
import { createSqliteRepository } from '../repositories/sqlite.js';
import { createEventService } from '../services/eventService.js';
import { createBookingService } from '../services/bookingService.js';
import { createAuthService } from '../services/authService.js';
import { createWaitlistService } from '../services/waitlistService.js';
import { createCheckinService } from '../services/checkinService.js';
import { applySecurityHeaders } from './securityHeaders.js';
import { rateLimit } from '../lib/rateLimit.js';

const DEFAULT_PUBLIC_DIRECTORY = fileURLToPath(new URL('../../public/', import.meta.url));
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function sendError(response, status, code, message) {
  sendJson(response, status, { error: { code, message } });
}

async function readJsonBody(request) {
  const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') return undefined;

  let text = '';
  for await (const chunk of request) text += chunk;
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError('INVALID_JSON', 'Request body must contain valid JSON');
  }
}

async function servePublicFile(response, pathname, publicDirectory, method) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendError(response, 400, 'INVALID_PATH', 'The request path is invalid');
    return;
  }

  const root = resolve(publicDirectory);
  const requestedPath = resolve(root, `.${decodedPath === '/' ? '/index.html' : decodedPath}`);
  const relativePath = relative(root, requestedPath);
  if (isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
    sendError(response, 404, 'NOT_FOUND', 'File not found');
    return;
  }

  try {
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(requestedPath)]);
    const actualRelativePath = relative(realRoot, realFile);
    if (
      isAbsolute(actualRelativePath) ||
      actualRelativePath === '..' ||
      actualRelativePath.startsWith(`..${sep}`)
    ) {
      sendError(response, 404, 'NOT_FOUND', 'File not found');
      return;
    }

    const fileStats = await stat(realFile);
    if (!fileStats.isFile()) {
      sendError(response, 404, 'NOT_FOUND', 'File not found');
      return;
    }
    response.writeHead(200, {
      'content-length': fileStats.size,
      'content-type': CONTENT_TYPES[extname(realFile).toLowerCase()] ?? 'application/octet-stream',
    });
    if (method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(realFile);
    stream.on('error', () => {
      if (response.headersSent) response.destroy();
      else sendError(response, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    });
    stream.pipe(response);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      sendError(response, 404, 'NOT_FOUND', 'File not found');
      return;
    }
    throw error;
  }
}

/**
 * Map DomainError codes to sensible HTTP status codes.
 */
function statusForError(code) {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'FORBIDDEN':
      return 403;
    case 'UNAUTHENTICATED':
    case 'INVALID_CREDENTIALS':
      return 401;
    case 'EMAIL_TAKEN':
    case 'BOOKING_EXPIRED':
      return 409;
    case 'SOLD_OUT':
    case 'INVALID_STATE':
    case 'INVALID_TRANSITION':
    case 'PAYMENT_DECLINED':
    case 'NOT_SOLD_OUT':
    case 'INVALID':
    case 'DUPLICATE':
    case 'ALREADY_ON_WAITLIST':
    case 'OFFER_EXPIRED':
    case 'EVENT_STARTED':
      return 409;
    case 'RATE_LIMITED':
      return 429;
    case 'INVALID_JSON':
    case 'INVALID_PATH':
    case 'VALIDATION':
      return 400;
    default:
      return 400;
  }
}

export function createAppServer({
  router = new Router(),
  publicDirectory = DEFAULT_PUBLIC_DIRECTORY,
  repository = createSqliteRepository(),  // Build 5: SQLite is the default
} = {}) {
  const waitlistService = createWaitlistService(repository);
  const eventService = createEventService(repository);
  const bookingService = createBookingService(repository, {
    onSeatsFreed: (tierId, qty) => waitlistService.offerFreedSeats(tierId, qty),
  });
  const authService = createAuthService(repository);
  const checkinService = createCheckinService(repository);

  // Always have /health
  if (!router.match('GET', '/health')) {
    router.get('/health', () => ({ status: 200, body: { status: 'ok' } }));
  }

  // Register the real API routes
  registerRoutes(router, { eventService, bookingService, authService, waitlistService, checkinService });

  return createServer(async (request, response) => {
    applySecurityHeaders(response);
    try {
      const url = new URL(request.url, 'http://localhost');
      const route = router.match(request.method ?? 'GET', url.pathname);
      const body = await readJsonBody(request);

      // Rate limit sensitive endpoints
      const ip = request.socket?.remoteAddress || 'unknown';
      if (url.pathname === '/api/auth/login' || url.pathname === '/api/auth/signup') {
        const { allowed } = rateLimit(`auth:${ip}`, { windowMs: 60_000, max: 30 });
        if (!allowed) {
          sendError(response, 429, 'RATE_LIMITED', 'Too many attempts, try again later');
          return;
        }
      }
      if (url.pathname === '/api/checkin') {
        const { allowed } = rateLimit(`checkin:${ip}`, { windowMs: 60_000, max: 60 });
        if (!allowed) {
          sendError(response, 429, 'RATE_LIMITED', 'Too many check-in attempts');
          return;
        }
      }

      if (route) {
        const result = await route.handler({ request, params: route.params, body });
        sendJson(response, result?.status ?? 200, result?.body ?? result ?? null);
      } else if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        sendError(response, 404, 'NOT_FOUND', 'API route not found');
      } else if (request.method === 'GET' || request.method === 'HEAD') {
        await servePublicFile(response, url.pathname, publicDirectory, request.method);
      } else {
        sendError(response, 404, 'NOT_FOUND', 'Route not found');
      }
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      if (error instanceof DomainError) {
        sendError(response, statusForError(error.code), error.code, error.message);
        return;
      }
      console.error(error); // log unexpected errors for the developer
      sendError(response, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    }
  });
}
