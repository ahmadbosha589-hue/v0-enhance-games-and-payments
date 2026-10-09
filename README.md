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
- c.cx.ua partner banner integration (same-origin frame architecture; see docs/10-advertising.md)
- FaucetPay deposits (Merchant API checkout) for balance, advertising credit, and boosters
- Supabase authentication, 2FA, admin authorization, security controls, and fraud protections
- Crypto pricing and CCPayment v2 hosted-checkout/webhook reconciliation
- CWallet payments through the verified CCPayment hosted checkout path
- Optional EVM ERC-20 payments through injected wallets or WalletConnect, with server-side receipt and confirmation verification
- Database migration runner with checksum tracking
- Production deployment and verification documentation

## Honest status

This is a **pre-revenue software asset**, not a profitable operating business. Verified repository checks on 2026-10-09 and a read-only live-site check at 2026-10-09 00:20 UTC show:

- `npm run verify` passes: 363 tests across 72 files, zero TypeScript errors,
  zero ESLint errors (209 warnings), and a successful Next.js build with 195
  static pages. The build also verifies the `next-themes` CSP bootstrap hash.
- The anonymous smoke check on 2026-10-08 returned HTTP 200 for all 17 public routes on `https://www.faucero.com`.
- The branch has an enforcing compatibility CSP in `next.config.mjs` and
  request-nonce CSP for selected dynamic HTML routes via `proxy.ts`. Static pages
  still allow `'unsafe-inline'`, so that policy is not strong XSS mitigation.
  The live `HEAD` check at 2026-10-09 00:20 UTC still returned
  `Content-Security-Policy-Report-Only` and no enforcing CSP; production was not
  updated by these local changes.
- Local production-mode Chromium observed no CSP violations on six routes on
  2026-10-09. This does not prove production deployment, authenticated flows, or
  real ad/provider compatibility.
- Sensitive mutations fail closed when Redis/Upstash is unavailable; configure KV for durable cross-instance rate limiting or money routes will be denied.
- `npm run verify:launch -- --ci` last checked on 2026-10-08 passed code checks and reports missing operator values as warnings. The local non-CI launch check last checked that day failed on 25 required settings; neither check inspects Vercel's environment.
- Provider accounts, real ad fill, authenticated browser behavior, payment transactions, and production migrations have not been verified in this snapshot. No revenue or payout claims are implied.

External provider setup remains deployment-specific:

- CCPayment v2 and CWallet-via-CCPayment require the operator's own accounts, credentials, webhook domain, and small-value test transactions.
- EVM wallet payments require the operator's WalletConnect/Reown project ID, chain, RPC endpoint, ERC-20 token, treasury address, token rate, and confirmation policy.
- Advertiser and publisher networks require verified provider accounts, appropriate consent, and live rendering tests. Reward-framed Google creative is excluded from incentivized surfaces.
- c.cx.ua banner zone 32 requires the registered domain and per-zone frequency settings in the publisher panel; the same-tab redirect popup zone remains disabled.
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

The most recent local verification on 2026-10-09 completed with:

- 363 passing automated tests across 72 test files
- Zero TypeScript errors
- Zero ESLint errors (209 warnings remain)
- Successful production build; 195 static pages generated
- Build-time verification of the nonce CSP hash for the `next-themes` bootstrap
- `npm audit --omit=dev` last checked on 2026-10-08: zero production dependency vulnerabilities
- Local headless Chromium: no CSP violations on six sampled routes
- Live anonymous smoke check on 2026-10-08: 17/17 public routes returned HTTP 200

These checks do not establish provider readiness, authenticated user flows, or live database migration state. The production `HEAD` check at 2026-10-09 00:20 UTC still returned a report-only CSP and no enforcing CSP; deployment is pending.

Run `npm run verify:launch` in a fully configured deployment environment to check required operator settings. `npm run verify:launch -- --ci` keeps missing secrets as warnings while failing code/documentation checks. Run `npm run smoke -- --base-url https://www.faucero.com` to check public route reachability.

See:

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- [`docs/PRODUCTION-READINESS.md`](docs/PRODUCTION-READINESS.md)
- [`docs/ASSET-VALUATION.md`](docs/ASSET-VALUATION.md)
- [`docs/verification/manual-checklist.md`](docs/verification/manual-checklist.md)
- [`scripts/migrations/README.md`](scripts/migrations/README.md)

## License

See [`LICENSE`](LICENSE), [`LICENSE-BASIC.md`](LICENSE-BASIC.md), and [`LICENSE-EXTENDED.md`](LICENSE-EXTENDED.md).
