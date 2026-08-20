# Deployment and Production Runbook

## Current status

The repository has been verified locally and the configured Supabase database has the reviewed hardening and advertiser-delivery migrations applied.

Verified application gates:

- TypeScript: zero errors
- ESLint: zero errors; warnings remain for existing React/style issues and must be reviewed before enforcement is tightened
- Tests: 107 passing tests
- Production build: 196 routes generated
- Live Supabase RPC smoke tests: campaign creation, serving, click deduplication, and idempotent refunds passed inside rollback transactions

The application is **not yet a fully enabled production business**. Redis, payment providers, external ad providers, CMP/TCF, and authenticated browser rollout checks remain separate gates.

## Prerequisites

- Node.js version supported by the repository; the current verified environment uses Node 22.
- npm.
- Supabase project with a migration-compatible PostgreSQL connection.
- A deployment platform such as Vercel, or a self-hosted Node runtime.
- Provider accounts only for features that are deliberately enabled.

Never commit `.env.local`, provider secrets, database passwords, service-role keys, or connection strings.

## Environment variables

Configure secrets through the deployment platform's secret manager or a local `.env.local` file. Do not paste them into chat or source control.

### Required for Supabase-backed application runtime

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

### Required for migrations

The migration runner accepts the first available variable below:

```text
DATABASE_URL
POSTGRES_URL_NON_POOLING
POSTGRES_URL
```

Prefer Supabase's non-pooling/session connection for DDL migrations. The runner uses the Node `pg` client and does not require a native `psql` installation.

### Required before production rate limiting

The project currently recognizes Redis/Upstash configuration through the variables used by its rate-limit adapters. Configure and verify the exact names used by the deployed build, including the applicable `KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` pair.

Without Redis, the application reports a non-durable local-development fallback. Do not treat that mode as production-safe for abuse-sensitive rewards or mutations.

### Provider-gated features

- FaucetPay credentials are required before enabling real withdrawals.
- CCPayment v2 credentials are required before enabling live deposits, swaps, or withdrawals. Configure the production webhook and reconcile order status through the provider API.
- External ad-network tags require verified publisher accounts and exact provider configuration.
- AdSense requires publisher approval, compliant placement, `ads.txt`, and an appropriate CMP/TCF posture.
- Rewarded-ad bonus payouts remain disabled until a verified provider and server-side watch-session proof are implemented.

## Database migrations

The migration set is tracked in `scripts/migrations/README.md` and currently contains:

```text
000_migration_state.sql
071_two_factor_hardening.sql
072_advertise_fixes.sql
073_ad_delivery.sql
074_ad_serve_rpc.sql
075_ad_balance_atomic.sql
076_postback_replay_guard.sql
077_ad_delivery_rpc_fix.sql
078_ad_delivery_daily_fix.sql
079_booster_purchase_atomic.sql
080_booster_claim_bonus.sql
081_booster_transaction_type.sql
082_booster_claim_constraint.sql
```

Run from the repository root:

```bash
node scripts/migrate.mjs --dry-run
node scripts/migrate.mjs --apply
```

The runner:

- Loads `.env.local` without printing values.
- Uses `DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, or `POSTGRES_URL`.
- Applies each migration transactionally.
- Stores SHA-256 checksums in `public.schema_migrations`.
- Refuses to continue if an applied migration has changed.

Back up the database and review the SQL against the target schema before applying to another environment.

## Local verification

```bash
rm -rf .next
rm -f *.tsbuildinfo
npm run verify
```

`npm run verify` runs typecheck, lint, tests, and the production build.

For a production smoke server:

```bash
npm start -- -p 3100
```

## Vercel deployment

1. Connect the repository to the Vercel project.
2. Configure the required environment variables in Vercel's encrypted settings.
3. Apply the Supabase migrations before enabling database-backed production traffic.
4. Configure Supabase Auth redirect URLs for the production origin.
5. Deploy a preview first.
6. Run the manual verification checklist against the preview.
7. Promote only after provider, consent, authentication, and mutation tests pass.

## Post-deployment checklist

- Confirm `/api/health` and public pages return successfully.
- Confirm unauthenticated admin APIs fail closed.
- Confirm anonymous mutation requests are rejected or require the intended authentication/consent state.
- Confirm Redis is reachable and rate limits are durable across instances.
- Confirm payment-provider test transactions before enabling payouts.
- Confirm external ad tags are verified and only approved placements render.
- Confirm rewarded-ad bonus flows remain disabled unless their provider/session proof is complete.
- Review logs for Supabase, Redis, payment, consent, and CSP errors.
- Run `docs/verification/manual-checklist.md` and retain evidence.

## Rollback

- Disable deployment traffic or revert to the previous deployment.
- Do not modify an applied migration file; create a forward corrective migration.
- Preserve database backups and migration checksums.
- Disable provider features before reverting application code that depends on them.
- Re-run the health and security smoke tests after rollback.

## Troubleshooting

### Database connection or migration errors

- Verify the target project and connection type.
- Prefer `POSTGRES_URL_NON_POOLING` for DDL.
- Confirm the database role owns application tables; Supabase-managed `auth.*` tables must not be altered by application migrations.
- Run the migration dry-run and compare checksums.

### Redis warnings

A missing Redis URL/token means rate limiting is using the local-development fallback. Configure Redis before production traffic; do not silence the warning.

### c.cx.ua banner appears empty

The c.cx.ua banner endpoint is domain-aware. The configured zone returned an empty
200 response for the Vercel preview origin but returned a real creative for the
registered production origins. Set the c.cx.ua publisher site's domain to the
actual production hostname, deploy there, and verify the zone is active. The
Vercel preview URL is not evidence that the production banner is broken.

The banner is also gated by Marketing consent and Do-Not-Track. The UI now hides
the `Sponsored` label until a real creative has been measured.
### Withdrawals or swaps unavailable

This is expected until the corresponding provider credentials, account balances, webhook signatures, and small-value test transactions are verified.
