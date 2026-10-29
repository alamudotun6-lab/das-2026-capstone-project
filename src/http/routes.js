import { DomainError } from '../domain/errors.js';
import { requireUser, requireRole } from './guards.js';

export function registerRoutes(router, { eventService, bookingService, authService, waitlistService, checkinService }) {
  // ---- Auth ----
  router.post('/api/auth/signup', async ({ body }) => {
    const result = await authService.signup(body || {});
    return { status: 201, body: result };
  });

  router.post('/api/auth/login', async ({ body }) => {
    const result = await authService.login(body || {});
    return { status: 200, body: result };
  });

  router.get('/api/auth/me', async ({ request }) => {
    const user = requireUser(request);
    const me = await authService.me(user.id);
    return { status: 200, body: me };
  });

  // ---- Events ----
  router.post('/api/events', async ({ body, request }) => {
    const user = requireRole(request, 'organizer');
    const event = await eventService.createEvent({ ...body, organizerId: user.id });
    return { status: 201, body: event };
  });

  router.post('/api/events/:id/tiers', async ({ params, body, request }) => {
    const user = requireRole(request, 'organizer');
    const event = await eventService.getEvent(params.id);
    if (event.organizerId !== user.id) {
      throw new DomainError('FORBIDDEN', 'You can only manage your own events');
    }
    const tier = await eventService.addTier(params.id, body);
    return { status: 201, body: tier };
  });

  router.post('/api/events/:id/publish', async ({ params, request }) => {
    const user = requireRole(request, 'organizer');
    const event = await eventService.getEvent(params.id);
    if (event.organizerId !== user.id) {
      throw new DomainError('FORBIDDEN', 'You can only manage your own events');
    }
    const published = await eventService.publishEvent(params.id);
    return { status: 200, body: published };
  });

  router.get('/api/events', async ({ request }) => {
    const url = new URL(request.url, 'http://localhost');
    const criteria = {
      q: url.searchParams.get('q') ?? undefined,
      city: url.searchParams.get('city') ?? undefined,
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      maxPriceCents: url.searchParams.has('maxPriceCents')
        ? Number(url.searchParams.get('maxPriceCents'))
        : undefined,
      onlyAvailable: url.searchParams.get('onlyAvailable') === 'true' ? true : undefined,
      sort: url.searchParams.get('sort') ?? 'date',
    };
    const events = await eventService.searchEvents(criteria);
    return { status: 200, body: events };
  });

  router.get('/api/events/:id', async ({ params }) => {
    const event = await eventService.getEvent(params.id);
    return { status: 200, body: event };
  });

  // ---- Bookings ----
  router.post('/api/bookings', async ({ body, request }) => {
    const user = requireUser(request);
    const booking = await bookingService.bookTickets({
      tierId: body.tierId,
      userId: user.id,
      quantity: body.quantity,
    });
    return { status: 201, body: booking };
  });

  router.post('/api/bookings/:reference/pay', async ({ params, body, request }) => {
    const user = requireUser(request);
    const booking = await bookingService.payBooking(params.reference, {
      userId: user.id,
      decline: body?.decline === true,
    });
    return { status: 200, body: booking };
  });

  router.post('/api/bookings/:reference/cancel', async ({ params, request }) => {
    const user = requireUser(request);
    const booking = await bookingService.cancelBooking(params.reference, { userId: user.id });
    return { status: 200, body: booking };
  });

  router.get('/api/bookings/:reference', async ({ params, request }) => {
    const user = requireUser(request);
    const booking = await bookingService.findBookingByReference(params.reference);
    if (booking.userId !== user.id && user.role !== 'organizer') {
      throw new DomainError('NOT_FOUND', 'Booking not found');
    }
    return { status: 200, body: booking };
  });

  router.get('/api/bookings/:reference/refund-preview', async ({ params, request }) => {
    const user = requireUser(request);
    const preview = await bookingService.previewRefund(params.reference, { userId: user.id });
    return { status: 200, body: preview };
  });

  router.get('/api/my/bookings', async ({ request }) => {
    const user = requireUser(request);
    const bookings = await bookingService.listBookingsForUser(user.id);
    return { status: 200, body: bookings };
  });

  // ---- Waitlist ----
  router.post('/api/waitlist', async ({ body, request }) => {
    const user = requireUser(request);
    if (!waitlistService) throw new DomainError('NOT_IMPLEMENTED', 'Waitlist not available');
    const entry = await waitlistService.join({
      tierId: body.tierId,
      userId: user.id,
      quantity: body.quantity,
    });
    return { status: 201, body: entry };
  });

  router.post('/api/waitlist/:tierId/accept', async ({ params, request }) => {
    const user = requireUser(request);
    if (!waitlistService) throw new DomainError('NOT_IMPLEMENTED', 'Waitlist not available');
    const booking = await waitlistService.acceptOffer({ tierId: params.tierId, userId: user.id });
    return { status: 200, body: booking };
  });

  router.get('/api/waitlist/:tierId/offer', async ({ params, request }) => {
    const user = requireUser(request);
    if (!waitlistService) return { status: 200, body: null };
    const offer = await waitlistService.getOffer({ tierId: params.tierId, userId: user.id });
    return { status: 200, body: offer };
  });

  // ---- Check-in (staff only) ----
  router.post('/api/checkin', async ({ body, request }) => {
    const user = requireRole(request, 'staff');
    if (!checkinService) throw new DomainError('NOT_IMPLEMENTED', 'Check-in not available');
    const result = await checkinService.checkIn({
      token: body?.token,
      eventId: body?.eventId,
      staffId: user.id,
    });
    return { status: 200, body: result };
  });

  // GET /api/bookings/:reference/ticket – signed QR token for paid bookings
  router.get('/api/bookings/:reference/ticket', async ({ params, request }) => {
    const user = requireUser(request);
    const booking = await bookingService.findBookingByReference(params.reference);
    if (booking.userId !== user.id && user.role !== 'staff' && user.role !== 'organizer') {
      throw new DomainError('NOT_FOUND', 'Booking not found');
    }
    if (booking.status !== 'paid' && booking.status !== 'checked_in') {
      throw new DomainError('INVALID_STATE', 'Ticket is only available for paid bookings');
    }
    const { signTicket } = await import('../lib/ticketToken.js');
    const token = signTicket({ reference: booking.reference });
    return { status: 200, body: { reference: booking.reference, token, status: booking.status } };
  });
}
