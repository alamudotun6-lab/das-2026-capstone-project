import { searchEvents } from '../domain/eventSearch.js';
import { DomainError } from '../domain/errors.js';

export function createEventService(repo) {
  return {
    async createEvent({ title, city, venue, startsAt, organizerId }) {
      if (!organizerId) throw new DomainError('VALIDATION', 'organizerId is required');
      return repo.createEvent({ title, city, venue, startsAt, organizerId });
    },

    async addTier(eventId, { name, priceCents, capacity }) {
      return repo.addTier(eventId, { name, priceCents, capacity });
    },

    async publishEvent(eventId) {
      return repo.publishEvent(eventId);
    },

    async searchEvents({ q, city, from, to, maxPriceCents, onlyAvailable, sort = 'date' } = {}) {
      const summaries = await repo.listEventSummaries({ publishedOnly: true });
      return searchEvents(summaries, { q, city, from, to, maxPriceCents, onlyAvailable }, sort);
    },

    async getEvent(eventId) {
      const event = await repo.getEvent(eventId);
      if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
      // Attach tiers when the repository can provide them
      if (typeof repo.getTiersForEvent === 'function') {
        const tiers = await repo.getTiersForEvent(eventId);
        return { ...event, tiers };
      }
      return event;
    },
  };
}
