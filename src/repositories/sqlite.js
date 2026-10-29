// SQLite repository. Same public methods as memory.js so services stay unchanged.
// Every query uses placeholders. Seat reservation is a single atomic UPDATE.

import { newId, referenceCode } from '../domain/ids.js';
import { DomainError } from '../domain/errors.js';
import { summarizeEvent } from '../domain/eventSearch.js';
import { openDatabase } from '../db/connection.js';

const MAX_TICKETS_PER_BOOKING = 10;

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${field} is required`);
  }
  return value.trim();
}

function requireWholeNumber(value, field, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new DomainError('VALIDATION', `${field} must be a whole number of at least ${min}`);
  }
  return value;
}

export function createSqliteRepository(dbPath) {
  const db = openDatabase(dbPath);

  // Prepared statements (re-used for speed)
  const stmts = {
    insertUserFull: db.prepare(
      `INSERT INTO users (id, name, email, role, password_hash) VALUES (?, ?, ?, ?, ?)`
    ),
    findUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),
    findUserByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
    insertUser: db.prepare(
      `INSERT OR IGNORE INTO users (id, name, email, role) VALUES (?, ?, ?, ?)`
    ),
    insertEvent: db.prepare(
      `INSERT INTO events (id, organizer_id, title, city, venue, starts_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'draft')`
    ),
    insertTier: db.prepare(
      `INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, sold)
       VALUES (?, ?, ?, ?, ?, 0)`
    ),
    publishEvent: db.prepare(
      `UPDATE events SET status = 'published' WHERE id = ?`
    ),
    getEvent: db.prepare(`SELECT * FROM events WHERE id = ?`),
    getTier: db.prepare(`SELECT * FROM ticket_tiers WHERE id = ?`),
    listPublishedEvents: db.prepare(
      `SELECT * FROM events WHERE status = 'published'`
    ),
    listAllEvents: db.prepare(`SELECT * FROM events`),
    tiersForEvent: db.prepare(
      `SELECT * FROM ticket_tiers WHERE event_id = ?`
    ),
    // THE ATOMIC RESERVATION – this is the overselling fix
    reserveSeats: db.prepare(
      `UPDATE ticket_tiers
       SET sold = sold + ?
       WHERE id = ? AND sold + ? <= capacity`
    ),
    insertBooking: db.prepare(
      `INSERT INTO bookings
         (id, reference, user_id, tier_id, quantity, amount_cents, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
    ),
    findBookingByRef: db.prepare(
      `SELECT * FROM bookings WHERE reference = ?`
    ),
    listBookingsForUser: db.prepare(
      `SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC`
    ),
    updateBookingStatus: db.prepare(
      `UPDATE bookings SET status = ?, paid_at = ? WHERE reference = ?`
    ),
    releaseSeats: db.prepare(
      `UPDATE ticket_tiers SET sold = sold - ? WHERE id = ?`
    ),
  };

  // Ensure a default organizer/attendee exist so foreign keys never fail in demos
  function ensureUser(id, role = 'attendee') {
    stmts.insertUser.run(id, id, `${id}@example.com`, role);
  }

  return {
    async createEvent({ title, city, venue = '', startsAt, organizerId }) {
      const date = new Date(startsAt);
      if (Number.isNaN(date.getTime())) {
        throw new DomainError('VALIDATION', 'startsAt must be a valid date');
      }
      ensureUser(organizerId, 'organizer');
      const id = newId();
      stmts.insertEvent.run(
        id,
        organizerId,
        requireText(title, 'Title'),
        requireText(city, 'City'),
        String(venue).trim(),
        date.toISOString()
      );
      return {
        id,
        organizerId,
        title: requireText(title, 'Title'),
        city: requireText(city, 'City'),
        venue: String(venue).trim(),
        startsAt: date.toISOString(),
        status: 'draft',
        tierIds: [],
      };
    },

    async addTier(eventId, { name, priceCents, capacity }) {
      const event = stmts.getEvent.get(eventId);
      if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

      const id = newId();
      const price = requireWholeNumber(priceCents, 'priceCents', 0);
      const cap = requireWholeNumber(capacity, 'capacity', 1);
      stmts.insertTier.run(id, eventId, requireText(name, 'Tier name'), price, cap);

      return {
        id,
        eventId,
        name: requireText(name, 'Tier name'),
        priceCents: price,
        capacity: cap,
        sold: 0,
      };
    },

    async publishEvent(eventId) {
      const event = stmts.getEvent.get(eventId);
      if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
      const tiers = stmts.tiersForEvent.all(eventId);
      if (tiers.length === 0) {
        throw new DomainError('INVALID_STATE', 'Add at least one ticket tier before publishing');
      }
      stmts.publishEvent.run(eventId);
      return { ...mapEvent(event), status: 'published', tierIds: tiers.map((t) => t.id) };
    },

    async listEventSummaries({ publishedOnly = true } = {}) {
      const events = publishedOnly
        ? stmts.listPublishedEvents.all()
        : stmts.listAllEvents.all();
      return events.map((event) => {
        const tiers = stmts.tiersForEvent.all(event.id);
        return summarizeEvent(mapEvent(event), tiers.map(mapTier));
      });
    },

    async getEvent(eventId) {
      const row = stmts.getEvent.get(eventId);
      return row ? mapEvent(row) : null;
    },

    async getTier(tierId) {
      const row = stmts.getTier.get(tierId);
      return row ? mapTier(row) : null;
    },

    async getTiersForEvent(eventId) {
      return stmts.tiersForEvent.all(eventId).map(mapTier);
    },

    /**
     * Book tickets using a single atomic UPDATE.
     * If the UPDATE changes 0 rows, capacity was exceeded → SOLD_OUT.
     * This is the fix for the last-ticket race condition.
     */
    async bookTickets(tierId, userId, quantity) {
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
        throw new DomainError(
          'VALIDATION',
          `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`
        );
      }

      const tier = stmts.getTier.get(tierId);
      if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');

      ensureUser(userId, 'attendee');

      // ATOMIC: only succeed if there is still room
      const result = stmts.reserveSeats.run(quantity, tierId, quantity);
      if (result.changes === 0) {
        const left = tier.capacity - tier.sold;
        const message =
          left <= 0
            ? `${tier.name} is sold out`
            : `Only ${left} ticket(s) left in ${tier.name}`;
        throw new DomainError('SOLD_OUT', message, { seatsLeft: Math.max(0, left) });
      }

      // Generate a unique reference
      let reference;
      do {
        reference = referenceCode();
      } while (stmts.findBookingByRef.get(reference));

      const id = newId();
      const amountCents = tier.price_cents * quantity;
      const createdAt = new Date().toISOString();

      stmts.insertBooking.run(
        id,
        reference,
        userId,
        tierId,
        quantity,
        amountCents,
        createdAt
      );

      return {
        id,
        reference,
        userId,
        tierId,
        quantity,
        amountCents,
        status: 'pending',
        createdAt,
      };
    },

    async findBookingByReference(reference) {
      const row = stmts.findBookingByRef.get(reference);
      return row ? mapBooking(row) : null;
    },

    async listBookingsForUser(userId) {
      return stmts.listBookingsForUser.all(userId).map(mapBooking);
    },

    async cancelBooking(reference) {
      const booking = stmts.findBookingByRef.get(reference);
      if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
      if (booking.status !== 'pending' && booking.status !== 'paid') {
        throw new DomainError(
          'INVALID_STATE',
          `A ${booking.status} booking cannot be cancelled`
        );
      }

      stmts.updateBookingStatus.run('cancelled', null, reference);
      stmts.releaseSeats.run(booking.quantity, booking.tier_id);

      return { ...mapBooking(booking), status: 'cancelled' };
    },

    async saveBooking(booking) {
      // Used after payment: update status + paid_at
      stmts.updateBookingStatus.run(
        booking.status,
        booking.paidAt ?? null,
        booking.reference
      );
      return booking;
    },

    async joinWaitlist() {
      throw new DomainError('NOT_IMPLEMENTED', 'Waitlist not yet persisted in SQLite');
    },

    async offerNextOnWaitlist() {
      return undefined;
    },

    // ---- users (Build 7) ----
    async createUser(user) {
      stmts.insertUserFull.run(
        user.id,
        user.name,
        user.email,
        user.role,
        user.passwordHash
      );
      return user;
    },

    async findUserById(id) {
      const row = stmts.findUserById.get(id);
      return row ? mapUser(row) : null;
    },

    async findUserByEmail(email) {
      const row = stmts.findUserByEmail.get(email);
      return row ? mapUser(row) : null;
    },

    // For tests / diagnostics
    _db: db,
    seatsLeft(tier) {
      return tier.capacity - tier.sold;
    },
  };
}

function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
  };
}

function mapEvent(row) {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    title: row.title,
    city: row.city,
    venue: row.venue,
    startsAt: row.starts_at,
    status: row.status,
    tierIds: [], // filled by callers that need it
  };
}

function mapTier(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    priceCents: row.price_cents,
    capacity: row.capacity,
    sold: row.sold,
  };
}

function mapBooking(row) {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    tierId: row.tier_id,
    quantity: row.quantity,
    amountCents: row.amount_cents,
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at ?? undefined,
  };
}
