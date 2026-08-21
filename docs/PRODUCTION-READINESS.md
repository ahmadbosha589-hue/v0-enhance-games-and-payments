# Production Readiness Snapshot

**Snapshot:** 2026-08-20

## Verified

### Application

- Public/auth/dashboard/admin routes compile successfully.
- TypeScript has zero diagnostics.
- ESLint exits successfully with zero errors; existing warnings remain.
- 156 automated tests pass across 45 test files.
- The clean Next.js build generates 196 routes.
- Public HTTP smoke tests return `200`.
- Disabled rewarded-payout endpoints return controlled `503` responses rather than issuing unverified rewards.

### Supabase

The configured Supabase database contains the applied migration set through `093`:

- Two-factor hardening.
- Advertiser contracts and schema fixes.
- Isolated first-party delivery tables.
- Atomic serving, click deduplication, campaign creation, and refunds.
- Postback replay receipt ledger.
- Atomic signed-watch fulfillment for Shortlinks, PTC, and games.
- Atomic daily bonus, coupon, achievement, and referral reward fulfillment.
- Durable direct FaucetPay payout reservation/finalization.
- Reward table write ACL lockdown and legacy SECURITY DEFINER routine revocation.
- Server-started PTC watch sessions, schema compatibility, and budget floor enforcement.
- Browser platform statistics moved behind server routes.

Rollback-based live tests verified:

- One impression per viewer/slot/minute dedupe bucket.
- One valid click per viewer/campaign/hour dedupe bucket.
- Atomic campaign balance reservation.
- Idempotent campaign refund.
- Daily campaign rollups.

## Not verified or not configured

- Redis/Upstash distributed rate limiting.
- FaucetPay production payout flow.
- CCPayment deposits, swaps, webhooks, and withdrawals.
- External ad-network publisher tags.
- AdSense approval, ads.txt production verification, and CMP/TCF compliance.
- Authenticated browser testing with real user accounts.
- Supabase-managed `supabase_admin` default privileges: the configured migration role cannot alter that owner’s defaults; newly created objects by that managed owner must be reviewed separately.
- Lighthouse, load, abuse, and multi-instance deployment testing.
- Production rollout and rollback drills.

## Current live-data signal

The current Supabase snapshot contains:

- 33 registered profiles.
- 3 profiles active within the last 30 days.
- 47 claims.
- 135 completed transactions.
- 3 offerwall conversions.
- 30 PTC views.
- 184 game sessions.
- No advertiser campaigns or advertiser transactions.
- No recorded withdrawals.

These are platform activity counts, not revenue. They should not be presented to buyers as proof of an operating business or recurring income.

## Launch policy

Do not enable production withdrawals, swaps, rewarded bonuses, or external ad monetization until the provider-specific gates are complete. A controlled public beta can be considered after Redis, payment test transactions, consent behavior, and authenticated browser checks pass.

## Evidence to retain before launch

- Migration checksum output.
- Database backup identifier and rollback plan.
- Screenshots/video of auth, consent, advertiser review, and withdrawal states.
- Provider webhook and signature test results.
- Redis rate-limit cross-instance test output.
- Lighthouse and mobile accessibility reports.
- Load/abuse test results.
