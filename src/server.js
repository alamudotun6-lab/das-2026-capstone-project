import { pathToFileURL } from 'node:url';
import { createAppServer } from './http/app.js';
import { Router } from './http/router.js';
import { registerRoutes } from './http/routes.js';
import { createMemoryRepository } from './repositories/memory.js';
import { createEventService } from './services/eventService.js';
import { createBookingService } from './services/bookingService.js';
import { PORT } from './config.js';

export function createFullyWiredServer() {
  const repo = createMemoryRepository();
  const eventService = createEventService(repo);
  const bookingService = createBookingService(repo);

  const router = new Router();
  registerRoutes(router, { eventService, bookingService });

  return createAppServer({ router });
}

export function startServer(port = PORT) {
  const server = createFullyWiredServer();
  server.listen(port, () => {
    console.log(`Event ticketing server listening on port ${port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
