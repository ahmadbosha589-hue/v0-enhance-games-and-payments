# Faucero Crypto Faucet Platform

Pre-revenue cryptocurrency faucet and earning-platform software built with Next.js, React, TypeScript, and Supabase/PostgreSQL.

## Demo

Public demo: https://v0-enhance-games-and-payments.vercel.app/

The demo is for software evaluation. It is not a guarantee of revenue, user growth, payouts, or provider availability.

## Included functionality

- Faucet claims, streaks, referrals, bonuses, and user dashboards
- PTC, offerwall, games, tournaments, and achievements
- Advertiser campaign creation, review, first-party serving, click tracking, daily statistics, and refunds
- Supabase authentication, 2FA, admin authorization, security controls, and fraud protections
- Crypto pricing and payment-provider integration structure
- Database migration runner with checksum tracking
- Production deployment and verification documentation

## Honest status

This is a **pre-revenue software asset**, not a profitable operating business. Current external provider work remains deployment-specific:

- Redis/Upstash must be configured for durable production rate limiting.
- FaucetPay and CCPayment require the buyer's own accounts and credentials.
- External advertising and CMP/TCF configuration require verified provider accounts.
- Rewarded-ad bonus payouts remain disabled until a verified provider and server-side watch-session proof are configured.
- Authenticated browser, load, abuse, and final production rollout testing remain required.

## Local setup

```bash
npm ci
npm run verify
npm start
```

Use a local `.env.local` file for credentials. Never commit service-role keys, database URLs, payment keys, or provider secrets.

## Database migrations

```bash
node scripts/migrate.mjs --dry-run
node scripts/migrate.mjs --apply
```

The runner accepts `DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, or `POSTGRES_URL` and records migration checksums in `public.schema_migrations`.

## Verification

The latest verified repository state has:

- 107 passing automated tests
- Zero TypeScript errors
- Zero ESLint errors
- 196 production routes generated
- Live Supabase rollback tests for advertiser serving, clicks, atomic campaign creation, and refunds

See:

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/PRODUCTION-READINESS.md`](docs/PRODUCTION-READINESS.md)
- [`docs/ASSET-VALUATION.md`](docs/ASSET-VALUATION.md)
- [`docs/verification/manual-checklist.md`](docs/verification/manual-checklist.md)
- [`scripts/migrations/README.md`](scripts/migrations/README.md)

## License

See [`LICENSE`](LICENSE), [`LICENSE-BASIC.md`](LICENSE-BASIC.md), and [`LICENSE-EXTENDED.md`](LICENSE-EXTENDED.md).
