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
19. `089_game_cooldown_atomicity.sql`
20. `090_reward_surface_fail_closed.sql`
21. `091_ptc_server_start_and_budget_floor.sql`
22. `092_legacy_reward_routine_acl.sql`
23. `093_read_rpc_acl.sql`

The 090 migration removes client write privileges from reward tables and routes
privileged writes through service-role clients. Migration 091 starts PTC timing
only on the explicit POST transition and rejects partial budgets. Migrations 092
and 093 revoke legacy reward routines and browser statistics RPCs. Verify the
live ACL and required columns with:

```bash
node scripts/verify-reward-acl.mjs
```

Migrations 094–110 (lexical order) cover provider seeds (095 c.cx.ua +
postback secrets), contact messages (100), security hygiene (101), game
cooldown ACL (102), games logic (103), tournaments reconciliation (104),
admin withdrawal refunds (105), admin balance RPC (106), rewarded-ad events
(107), booster live pricing (108), ad balance cashout (109), and CPX branding
(110). New integrations continue the same lexical sequence:

1. `111_telegram_links.sql` — backing tables for the Telegram bot
   (app/api/telegram/webhook/route.ts): `telegram_links` chat↔user mapping and
   `profiles.telegram_chat_id` + one-time `telegram_link_token`.

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
