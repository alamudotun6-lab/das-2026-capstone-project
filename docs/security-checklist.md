# Security checklist

| Threat | Protection |
|--------|------------|
| Stolen passwords | scrypt hash with per-password salt; constant-time compare |
| Forged login tokens | HMAC-SHA256; reject non-HS256; expiry check |
| Forged QR tickets | Separate `TICKET_SECRET`; constant-time signature verify |
| Personal data in QR | Payload is only booking reference + issued-at |
| Path traversal | Static file server resolves real paths and rejects `..` |
| XSS via API errors | Errors return JSON codes/messages only; no stack traces |
| Clickjacking | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` |
| MIME sniffing | `X-Content-Type-Options: nosniff` |
| Brute-force login | Rate limit on `/api/auth/login` and `/api/auth/signup` |
| Check-in spam | Rate limit on `/api/checkin` |
| Double check-in | Atomic compare-and-set on booking status |
| Overselling | Atomic `UPDATE … WHERE sold + ? <= capacity` |
| Secrets in Git | `.env` ignored; `.env.example` has placeholders only |
| Role escalation | Role checked on the server (`requireRole`), never only in the UI |

## Secrets

- `TOKEN_SECRET` – signs login tokens
- `TICKET_SECRET` – signs ticket QR tokens (must differ from `TOKEN_SECRET`)

Set both in the environment before running in production. See `.env.example`.
