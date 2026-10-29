import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeEvent,
  filterEvents,
  sortEvents,
  searchEvents,
} from '../src/domain/eventSearch.js';
import { DomainError } from '../src/domain/errors.js';

function makeSummary(overrides = {}) {
  return {
    id: overrides.id ?? 'id-1',
    title: overrides.title ?? 'Lagos Tech Meetup',
    city: overrides.city ?? 'Lagos',
    venue: overrides.venue ?? 'Yaba Hub',
    startsAt: overrides.startsAt ?? '2026-12-05T17:00:00.000Z',
    status: overrides.status ?? 'published',
    tierCount: overrides.tierCount ?? 1,
    minPriceCents: overrides.minPriceCents ?? 500000,
    seatsLeft: overrides.seatsLeft ?? 50,
  };
}

describe('summarizeEvent', () => {
  it('calculates min price and seats left from tiers', () => {
    const event = { id: 'e1', title: 'Test', city: 'Lagos', venue: '', startsAt: '2026-01-01T00:00:00Z', status: 'published' };
    const tiers = [
      { priceCents: 300000, capacity: 10, sold: 2 },
      { priceCents: 500000, capacity: 5, sold: 0 },
    ];
    const summary = summarizeEvent(event, tiers);
    assert.equal(summary.minPriceCents, 300000);
    assert.equal(summary.seatsLeft, 13); // 8 + 5
    assert.equal(summary.tierCount, 2);
  });
});

describe('filterEvents', () => {
  const events = [
    makeSummary({ id: '1', title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Yaba', startsAt: '2026-12-05T17:00:00Z', minPriceCents: 500000, seatsLeft: 10 }),
    makeSummary({ id: '2', title: 'Abuja Jazz Night', city: 'Abuja', venue: 'National Theatre', startsAt: '2026-11-20T19:00:00Z', minPriceCents: 200000, seatsLeft: 0 }),
    makeSummary({ id: '3', title: 'Lagos Food Festival', city: 'Lagos', venue: 'Lekki', startsAt: '2026-12-10T12:00:00Z', minPriceCents: 150000, seatsLeft: 30 }),
  ];

  it('filters by text (case-insensitive) on title or venue', () => {
    const result = filterEvents(events, { q: 'JAZZ' });
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'Abuja Jazz Night');
  });

  it('filters by city ignoring case', () => {
    const result = filterEvents(events, { city: 'lagos' });
    assert.equal(result.length, 2);
    assert.ok(result.every((e) => e.city === 'Lagos'));
  });

  it('filters by date range (inclusive, date-only to includes whole day)', () => {
    const result = filterEvents(events, { from: '2026-12-01', to: '2026-12-05' });
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'Lagos Tech Meetup');
  });

  it('filters by max price', () => {
    const result = filterEvents(events, { maxPriceCents: 200000 });
    assert.equal(result.length, 2);
  });

  it('filters only available seats', () => {
    const result = filterEvents(events, { onlyAvailable: true });
    assert.equal(result.length, 2);
    assert.ok(result.every((e) => e.seatsLeft > 0));
  });

  it('does not modify the original list', () => {
    const copy = [...events];
    filterEvents(events, { q: 'Jazz' });
    assert.deepEqual(events, copy);
  });

  it('rejects invalid maxPriceCents with VALIDATION', () => {
    assert.throws(
      () => filterEvents(events, { maxPriceCents: 1.5 }),
      (err) => err instanceof DomainError && err.code === 'VALIDATION'
    );
  });
});

describe('sortEvents', () => {
  const events = [
    makeSummary({ id: 'b', title: 'Beta', startsAt: '2026-12-10T00:00:00Z', minPriceCents: 300000, seatsLeft: 5 }),
    makeSummary({ id: 'a', title: 'Alpha', startsAt: '2026-12-05T00:00:00Z', minPriceCents: 500000, seatsLeft: 20 }),
    makeSummary({ id: 'c', title: 'Charlie', startsAt: '2026-12-05T00:00:00Z', minPriceCents: 100000, seatsLeft: 10 }),
  ];

  it('sorts by date (earliest first) and is stable on ties', () => {
    const sorted = sortEvents(events, 'date');
    assert.equal(sorted[0].title, 'Alpha');
    assert.equal(sorted[1].title, 'Charlie'); // same day, title order
    assert.equal(sorted[2].title, 'Beta');
  });

  it('sorts by price (cheapest first)', () => {
    const sorted = sortEvents(events, 'price');
    assert.equal(sorted[0].title, 'Charlie');
    assert.equal(sorted[1].title, 'Beta');
    assert.equal(sorted[2].title, 'Alpha');
  });

  it('sorts by availability (most seats first)', () => {
    const sorted = sortEvents(events, 'availability');
    assert.equal(sorted[0].title, 'Alpha');
    assert.equal(sorted[1].title, 'Charlie');
    assert.equal(sorted[2].title, 'Beta');
  });

  it('does not modify the original list', () => {
    const copy = [...events];
    sortEvents(events, 'date');
    assert.deepEqual(events, copy);
  });

  it('rejects unknown sortBy with VALIDATION', () => {
    assert.throws(
      () => sortEvents(events, 'popularity'),
      (err) => err instanceof DomainError && err.code === 'VALIDATION'
    );
  });
});

describe('searchEvents', () => {
  const events = [
    makeSummary({ id: '1', title: 'Lagos Tech', city: 'Lagos', startsAt: '2026-12-05T00:00:00Z', minPriceCents: 500000, seatsLeft: 10 }),
    makeSummary({ id: '2', title: 'Abuja Jazz', city: 'Abuja', startsAt: '2026-11-20T00:00:00Z', minPriceCents: 200000, seatsLeft: 0 }),
  ];

  it('filters then sorts', () => {
    const result = searchEvents(events, { city: 'Lagos' }, 'date');
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'Lagos Tech');
  });
});
