# API examples (Build 4)

All examples assume the server is running on `http://localhost:3000`.

Identity is passed with the `x-user-id` header until Build 7 adds real login.

---

## 1. Create an event

```bash
curl -s -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "x-user-id: organizer-1" \
  -d '{
    "title": "Lagos Tech Meetup",
    "city": "Lagos",
    "venue": "Yaba Hub",
    "startsAt": "2026-12-05T17:00:00Z"
  }'
```

Save the returned `id` – you will need it for the next calls.

---

## 2. Add a ticket tier

```bash
curl -s -X POST http://localhost:3000/api/events/EVENT_ID/tiers \
  -H "Content-Type: application/json" \
  -H "x-user-id: organizer-1" \
  -d '{
    "name": "General",
    "priceCents": 500000,
    "capacity": 3
  }'
```

Save the returned tier `id`.

---

## 3. Publish the event

```bash
curl -s -X POST http://localhost:3000/api/events/EVENT_ID/publish \
  -H "x-user-id: organizer-1"
```

---

## 4. Search published events

```bash
curl -s "http://localhost:3000/api/events?city=Lagos&sort=date"
```

Optional query parameters: `q`, `city`, `from`, `to`, `maxPriceCents`, `onlyAvailable=true`, `sort=date|price|availability`.

---

## 5. Book tickets

```bash
curl -s -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -H "x-user-id: attendee-ada" \
  -d '{
    "tierId": "TIER_ID",
    "quantity": 2
  }'
```

Save the returned `reference`.

---

## 6. Pay for a booking (mock)

```bash
curl -s -X POST http://localhost:3000/api/bookings/REFERENCE/pay \
  -H "Content-Type: application/json" \
  -H "x-user-id: attendee-ada" \
  -d '{}'
```

To simulate a declined card:

```bash
curl -s -X POST http://localhost:3000/api/bookings/REFERENCE/pay \
  -H "Content-Type: application/json" \
  -H "x-user-id: attendee-ada" \
  -d '{"decline": true}'
```

---

## 7. Cancel an unpaid booking

```bash
curl -s -X POST http://localhost:3000/api/bookings/REFERENCE/cancel \
  -H "x-user-id: attendee-ada"
```

---

## 8. Look up a booking

```bash
curl -s http://localhost:3000/api/bookings/REFERENCE
```
