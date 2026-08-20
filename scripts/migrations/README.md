# Migration workflow

The repository contains legacy SQL files with inconsistent historical numbering. Do not
retroactively rename them. New hardening/delivery migrations use the `070+` range and
are applied in lexical order:

1. `071_two_factor_hardening.sql`
2. `072_advertise_fixes.sql`
3. `073_ad_delivery.sql`
4. `074_ad_serve_rpc.sql`
5. `075_ad_balance_atomic.sql`
6. `076_postback_replay_guard.sql`
7. `077_ad_delivery_rpc_fix.sql`
8. `078_ad_delivery_daily_fix.sql`
9. `079_booster_purchase_atomic.sql`
10. `080_booster_claim_bonus.sql`
11. `081_booster_transaction_type.sql`
12. `082_booster_claim_constraint.sql`
13. `083_wallet_payment_tx_unique.sql`
14. `084_reward_atomic_fulfillment.sql`
15. `085_reward_rpc_acl.sql`
16. `086_atomic_bonus_coupon_achievement_referral.sql`
17. `087_manual_faucet_reservation.sql`
18. `088_reward_view_duplicate_cleanup.sql`

`075_ad_balance_atomic.sql` locks the advertiser profile, inserts the campaign,
deducts the budget, and records the transaction in one database transaction.

Use the runner from the repository root:

```bash
node scripts/migrate.mjs --dry-run
node scripts/migrate.mjs --apply
```

The runner loads `.env.local` without printing values and accepts
`DATABASE_URL`, `POSTGRES_URL_NON_POOLING`, or `POSTGRES_URL`. It uses the
Node `pg` client, so a native `psql` installation is not required. Each applied
file is recorded in `public.schema_migrations` with a SHA-256 checksum. If a
previously applied file changes, the runner refuses to continue. Review SQL and
take a database backup before applying to staging or production.
