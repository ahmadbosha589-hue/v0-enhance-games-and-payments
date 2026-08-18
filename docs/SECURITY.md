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
be exposed through `GET`. The former unused `lib/security/csrf.ts` module was
removed rather than leaving an unconfigured token API that no route enforced.

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

Recommended security headers (configure in middleware/proxy):
- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin

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
