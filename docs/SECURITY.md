# Security Documentation

## Overview

CryptoFaucet implements multiple layers of security to prevent fraud and protect users.

## Authentication

### Session Management

- Sessions are managed via Supabase Auth
- JWT tokens are stored in HTTP-only cookies
- Refresh tokens rotate on use
- Sessions expire after 7 days of inactivity

### Password Requirements

- Minimum 8 characters
- Hashed with bcrypt (cost factor 12)
- Rate-limited login attempts

### Two-Factor Authentication

- TOTP-based (Google Authenticator, Authy compatible)
- Required for admin accounts
- Optional for regular users
- Backup codes provided

## Fraud Detection

### Scoring System

| Score Range | Status | Action |
|-------------|--------|--------|
| 0-29 | Clean | Normal operation |
| 30-49 | Low Risk | Monitoring |
| 50-79 | Medium Risk | Manual review required |
| 80-100 | High Risk | Auto-blocked |

### Detection Methods

1. **IP Analysis**
   - Track all IPs per user
   - Detect VPN/proxy usage
   - Limit accounts per IP (default: 3)
   - Flag rapid IP changes

2. **Device Fingerprinting**
   - Browser fingerprint collection
   - Device type tracking
   - Limit accounts per device (default: 2)
   - Flag device spoofing

3. **Behavior Analysis**
   - Claim frequency patterns
   - Withdrawal patterns
   - Account age vs activity
   - Referral abuse detection

## Rate Limiting

### Per-Endpoint Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| /api/claim | 10 requests | 1 minute |
| /api/withdraw | 5 requests | 1 hour |
| /auth/login | 10 requests | 15 minutes |
| General API | 100 requests | 1 minute |

### Implementation

- Shared API/proxy buckets use the Redis-backed limiter in `lib/redis/rate-limiter.ts`.
- If Redis is not configured, the limiter allows local development traffic and emits
  one explicit non-durable-fallback warning; production must configure Upstash.
- Responses should include a `Retry-After` value when a durable bucket rejects a request.

## Cross-Site Request Protection

First-party mutating requests (`POST`, `PUT`, `PATCH`, and `DELETE`) are checked in
`proxy.ts` using `Origin` and `Sec-Fetch-Site`. Requests marked `cross-site`, or
with an origin whose host does not match the request host, are rejected before the
route handler runs. Signed server-to-server postbacks, webhooks, and cron routes are
exempt because they authenticate with provider-specific signatures/secrets.

Supabase session cookies remain `SameSite=Lax`; state-changing endpoints must not
be exposed through `GET`. `proxy.ts` checks `Origin` and `Sec-Fetch-Site` on
unsafe browser methods and rejects cross-site requests before route execution.

Sensitive browser mutations add a signed double-submit CSRF token. Authenticated
`GET /api/csrf` reuses or issues a random HMAC-SHA256 token with a one-hour TTL;
the same value is returned in JSON and stored in the `__csrf` `httpOnly`
`SameSite=Strict` cookie (Secure in production). The client echoes the JSON value
as `x-csrf-token`. The server requires header/cookie equality, a valid timestamp
and HMAC, and constant-time signature comparison. `CSRF_SECRET` is preferred;
`SUPABASE_JWT_SECRET` is an allowed fallback. Either must contain at least 32
UTF-8 bytes; missing or weak configuration fails closed. The token is required
for withdrawal, coupon redemption, booster purchase, advertising campaign
create/update, and Telegram link-token regeneration. Provider-signed webhooks,
postbacks, and cron requests do not use browser CSRF tokens; they must validate
their own provider signature or secret.

## Data Protection

### Row Level Security (RLS)

All database tables implement RLS:
- Users can only access their own data
- Admins have role-based elevated access
- Service role bypasses for system operations

### Input Validation

- All inputs validated with Zod schemas
- SQL injection prevented via parameterized queries
- XSS prevented via React's default escaping

### Headers

Static response headers are configured in `next.config.mjs`. `proxy.ts` also creates
request-scoped CSP policies for selected dynamic HTML routes and preserves the
existing proxy response behavior. The existing `lib/security/headers.ts` helper
is intentionally preserved but is not wired to the active response path; treat
`next.config.mjs` and the nonce logic in `proxy.ts` as the active sources of
truth.

- `next.config.mjs` configures an enforcing `Content-Security-Policy`. It
  allowlists the app's active CAPTCHA, c.cx.ua, AdsGram, Supabase, configured
  offerwall, and legacy dashboard ad integrations; reports go to
  `/api/security/csp-report`.
- `proxy.ts` generates a cryptographic per-request nonce plus `'strict-dynamic'`
  for dynamic HTML routes (`/`, `/admin/*`, `/dashboard/*`, `/auth/*`,
  `/blog/[slug]`, and `/l/[id]`). These policies omit `'unsafe-inline'` from
  `script-src`; one exact SHA-256 hash permits the `next-themes` bootstrap script.
  The build verifies that hash against generated HTML with
  `scripts/verify-csp-hash.mjs`.
- Static/ISR pages retain `'unsafe-inline'` for Next.js bootstrap and data scripts
  so they can remain cacheable. Their `script-src` deliberately contains no hash
  or nonce, because browsers ignore `'unsafe-inline'` when either is present.
  Therefore the static compatibility policy is enforcing but is not a strong
  XSS-mitigation policy. Neither policy allows `'unsafe-eval'`.
- `img-src` and `media-src` allow HTTPS sources because ad creative image/video
  URLs are supplied dynamically by providers; other external resource types
  remain constrained by their own directives.
- `worker-src 'self' blob:` supports the existing blob-backed anti-adblock
  probes.
- `X-Frame-Options: SAMEORIGIN` and CSP `frame-ancestors 'self'` permit the
  same-origin c.cx.ua banner document while blocking cross-origin framing.
- `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: strict-origin-when-cross-origin` remain enabled.
- HSTS is `max-age=63072000`; `Permissions-Policy` denies accelerometer,
  camera, geolocation, gyroscope, magnetometer, microphone, payment, and USB
  access.
- Contract tests cover policy sources and nonce forwarding; the production build
  also verifies the exact `next-themes` bootstrap hash. On 2026-10-09, local
  production-mode Chromium observed zero CSP violations on `/`, `/auth/login`,
  `/dashboard`, `/about`, `/blog/example`, and `/l/short-id`. Dynamic responses
  used a nonce policy without `'unsafe-inline'`; static pages retained the
  compatibility policy. This is local branch evidence only.
- These checks do not establish complete provider-origin coverage. The browser
  run used `https://localhost:8443`, not the registered production origin. The
  c.cx.ua banner request previously failed with `net::ERR_BLOCKED_BY_ORB` under
  that local origin; real nested creative destinations, authenticated Supabase
  flows, and provider rendering remain unverified.
- A read-only production `HEAD` check at 2026-10-09 00:20 UTC preceded the deploy
  and returned report-only CSP. As of the 9e2b8de deploy the same day, the
  canonical root serves the enforcing nonce CSP verified above; watch
  `/api/security/csp-report` for real-world violations after any change.

## Audit Logging

All sensitive actions are logged:
- User authentication events
- Claims and withdrawals
- Admin actions
- Fraud flag changes
- System setting modifications

Logs include:
- User ID
- Action type
- IP address
- Timestamp
- Detailed context

## Incident Response

### Fraud Alert

1. System creates fraud flag
2. Notification sent to admin dashboard
3. Admin reviews and takes action
4. All actions logged for audit

### Account Compromise

1. User reports via contact form
2. Admin temporarily disables account
3. Investigation conducted
4. Password reset forced
5. Sessions invalidated

## Security Checklist

- [ ] Change default admin password
- [ ] Set strong METRICS_API_KEY
- [ ] Configure CORS for your domain
- [ ] Enable 2FA for all admin accounts
- [ ] Review fraud thresholds for your use case
- [ ] Set up monitoring alerts
- [ ] Regular audit log review
- [ ] Keep dependencies updated
