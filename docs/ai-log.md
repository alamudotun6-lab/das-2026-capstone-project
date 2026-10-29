# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 2–7
(See previous entries.)

## Build 8

### Prompt 1: Refunds, waitlist, expiry
- **What I asked:** Controllable clock, refund policy pure function, cancel paid with refund + compare-and-set, waitlist with timed offers, maintenance job for unpaid expiry, tests for every boundary.
- **What came back:** clock.js, refundPolicy.js, updated bookingService, waitlistService, maintenance job, full unit/integration tests.
- **What was wrong (or "nothing"):** Paying a cancelled booking now returns BOOKING_EXPIRED (clearer than INVALID_TRANSITION). Updated one API test accordingly. All 76 tests pass.

## Build 9

### Prompt 1: QR check-in, CI, security
- **What I asked:** Signed ticket tokens, check-in service with atomic CAS, security headers, rate limiting, CI workflow, security checklist, .env.example, forged/duplicate/simultaneous scan tests.
- **What came back:** ticketToken.js, checkinService, securityHeaders, rateLimit, checkin.html, QR visual, ci.yml, tests.
- **What was wrong (or "nothing"):** Nothing major. Ticket payload is only reference + iat. Simultaneous scans admit exactly one.
