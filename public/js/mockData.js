/**
 * Fake data that matches the shape returned by the real API.
 * Used only in Build 6 so the frontend can be developed without the server.
 */

export const mockEvents = [
  {
    id: 'evt-lagos-tech',
    title: 'Lagos Tech Meetup',
    city: 'Lagos',
    venue: 'Yaba Hub',
    startsAt: '2026-12-05T17:00:00.000Z',
    status: 'published',
    tierCount: 2,
    minPriceCents: 300000,
    seatsLeft: 48,
    tiers: [
      {
        id: 'tier-general',
        eventId: 'evt-lagos-tech',
        name: 'General',
        priceCents: 300000,
        capacity: 50,
        sold: 5,
      },
      {
        id: 'tier-vip',
        eventId: 'evt-lagos-tech',
        name: 'VIP',
        priceCents: 750000,
        capacity: 10,
        sold: 7,
      },
    ],
  },
  {
    id: 'evt-abuja-jazz',
    title: 'Abuja Jazz Night',
    city: 'Abuja',
    venue: 'National Theatre',
    startsAt: '2026-11-20T19:00:00.000Z',
    status: 'published',
    tierCount: 1,
    minPriceCents: 200000,
    seatsLeft: 0,
    tiers: [
      {
        id: 'tier-jazz',
        eventId: 'evt-abuja-jazz',
        name: 'General',
        priceCents: 200000,
        capacity: 80,
        sold: 80, // sold out
      },
    ],
  },
  {
    id: 'evt-lagos-food',
    title: 'Lagos Food Festival',
    city: 'Lagos',
    venue: 'Lekki Conservation Centre',
    startsAt: '2026-12-10T12:00:00.000Z',
    status: 'published',
    tierCount: 1,
    minPriceCents: 150000,
    seatsLeft: 120,
    tiers: [
      {
        id: 'tier-food',
        eventId: 'evt-lagos-food',
        name: 'Day Pass',
        priceCents: 150000,
        capacity: 150,
        sold: 30,
      },
    ],
  },
  {
    id: 'evt-ibadan-code',
    title: 'Ibadan Code Camp',
    city: 'Ibadan',
    venue: 'UI Conference Centre',
    startsAt: '2027-01-15T09:00:00.000Z',
    status: 'published',
    tierCount: 1,
    minPriceCents: 100000,
    seatsLeft: 40,
    tiers: [
      {
        id: 'tier-code',
        eventId: 'evt-ibadan-code',
        name: 'Student',
        priceCents: 100000,
        capacity: 40,
        sold: 0,
      },
    ],
  },
];

// In-memory bookings created during this browser session
export const mockBookings = new Map();
