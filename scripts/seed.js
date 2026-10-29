// Fill the SQLite database with a small demo dataset.
// Run with: npm run seed

import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'ticketing.db');
mkdirSync(join(process.cwd(), 'data'), { recursive: true });

const repo = createSqliteRepository(dbPath);

const event = await repo.createEvent({
  title: 'Lagos Tech Meetup',
  city: 'Lagos',
  venue: 'Yaba Hub',
  startsAt: '2026-12-05T17:00:00Z',
  organizerId: 'organizer-1',
});

const tier = await repo.addTier(event.id, {
  name: 'General',
  priceCents: 500_000,
  capacity: 100,
});

await repo.publishEvent(event.id);

console.log('Seeded:');
console.log(`  Event: ${event.title} (${event.id})`);
console.log(`  Tier:  ${tier.name} – ${tier.capacity} seats @ ${tier.priceCents} kobo`);
console.log(`  Database: ${dbPath}`);
console.log('Done. Restart the server and the data will still be there.');
