# Faucero Crypto Faucet Platform

Pre-revenue cryptocurrency faucet and earning-platform software built with Next.js, React, TypeScript, and Supabase/PostgreSQL.

## Demo

Public demo: https://www.faucero.com/

The purchased `faucero.com` domain is the canonical public demo and buyer-facing brand URL. The Vercel deployment URL is only an infrastructure fallback and should not be used as the main listing link.

The demo is for software evaluation. It is not a guarantee of revenue, user growth, payouts, or provider availability.

## Sale information

- Master sale listing: [`docs/SALE-LISTING.md`](docs/SALE-LISTING.md)
- Facebook-ready listing: [`docs/FACEBOOK-LISTING.md`](docs/FACEBOOK-LISTING.md)
- Valuation notes: [`docs/ASSET-VALUATION.md`](docs/ASSET-VALUATION.md)

## Included functionality

- Faucet claims, streaks, referrals, bonuses, and user dashboards
- PTC, offerwall, games, tournaments, and achievements
- Advertiser campaign creation, review, first-party serving, click tracking, daily statistics, and refunds
- Supabase authentication, 2FA, admin authorization, security controls, and fraud protections
- Crypto pricing and CCPayment v2 hosted-checkout/webhook reconciliation
- CWallet payments through the verified CCPayment hosted checkout path
- Optional EVM ERC-20 payments through injected wallets or WalletConnect, with server-side receipt and confirmation verification
- Database migration runner with checksum tracking
- Production deployment and verification documentation

## Honest status

This is a **pre-revenue software asset**, not a profitable operating business. Current external provider work remains deployment-specific:

- Redis/Upstash must be configured for durable production rate limiting.
- CCPayment v2 and CWallet-via-CCPayment require the buyer's own accounts, credentials, webhook domain, and small-value test transactions.
- EVM wallet payments require the buyer's own WalletConnect/Reown project ID, chain, RPC endpoint, ERC-20 token, treasury address, token rate, and confirmation policy.
- AdSense approval, publisher tag verification, and CMP/TCF configuration remain buyer/deployment-specific; `ads.txt` contains the supplied seller declaration.
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

- 156 passing automated tests
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
