# Migration workflow

The repository contains legacy SQL files with inconsistent historical numbering. Do not
retroactively rename them. New hardening/delivery migrations use the `070+` range and
are applied in lexical order:

1. `071_two_factor_hardening.sql`
2. `072_advertise_fixes.sql`
3. `073_ad_delivery.sql`
4. `074_ad_serve_rpc.sql`
5. `076_postback_replay_guard.sql`

`075` is intentionally absent because no reviewed balance migration was available in
this working copy. Do not invent or skip a required money-integrity migration in a
production rollout.

Use the runner from the repository root:

```bash
node scripts/migrate.mjs --dry-run
DATABASE_URL='[REDACTED]' node scripts/migrate.mjs --apply
```

The apply mode requires the native `psql` client and a `DATABASE_URL`; it never prints
that value. Each applied file is recorded in `public.schema_migrations` with a SHA-256
checksum. If a previously applied file changes, the runner refuses to continue. Review
SQL and take a database backup before applying to staging or production.
