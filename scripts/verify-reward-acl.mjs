#!/usr/bin/env node
// Read-only verification of the reward surface: SECURITY DEFINER execute grants,
// client-writable reward tables, and required columns. Prints no secrets.
//
// Usage: node scripts/verify-reward-acl.mjs
// Exit code 1 means at least one fail-closed expectation is violated.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "pg"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "..")

function loadLocalEnv() {
  try {
    const raw = readFileSync(join(repoRoot, ".env.local"), "utf8")
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i)
      if (!match) continue
      let value = match[2].trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[match[1]]) process.env[match[1]] = value
    }
  } catch {
    // A missing local env file is handled by the required-variable check below.
  }
  process.env.DATABASE_URL ||=
    process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || ""
}

loadLocalEnv()

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL

if (!connectionString) {
  console.error(
    "DATABASE_URL, POSTGRES_URL_NON_POOLING, or POSTGRES_URL is required (value intentionally not printed)",
  )
  process.exit(2)
}

// Every routine that can move balances or write reward ledgers must be
// service-role only. Client roles must hold no EXECUTE privilege.
const REWARD_ROUTINES = [
  "add_game_reward",
  "atomic_claim",
  "admin_activate_booster",
  "atomic_withdraw",
  "calculate_claim_amount",
  "calculate_user_balance_from_transactions",
  "can_play_game",
  "can_play_game_type",
  "can_user_claim",
  "cleanup_old_security_data",
  "complete_game_session",
  "finalize_tournament",
  "get_authoritative_balance",
  "get_claim_amount",
  "get_or_create_tournament",
  "get_user_stats",
  "handle_new_user",
  "increment_ad_stats",
  "increment_fraud_score",
  "process_offerwall_conversion",
  "process_referral_commission",
  "process_withdrawal",
  "reset_daily_support_stats",
  "reverse_offerwall_conversion",
  "set_game_cooldown",
  "start_game_session",
  "update_tournament_score",
  "validate_user_balance_integrity",
  "verify_and_repair_all_balances",
  "safe_add_balance",
  "modify_user_balance",
  "complete_shortlink_view",
  "complete_ptc_view",
  "complete_game_reward",
  "complete_daily_bonus",
  "redeem_coupon_atomic",
  "claim_achievement_atomic",
  "reserve_manual_faucet_claim",
  "finalize_manual_faucet_claim",
]

// Reward-bearing tables that clients must never write directly.
const REWARD_TABLES = [
  "ptc_views",
  "shortlink_views",
  "game_sessions",
  "game_daily_limits",
  "game_cooldowns",
  "claims",
  "transactions",
  "coupon_redemptions",
  "user_achievements",
  "manual_faucet_claims",
  "ptc_ads",
  "shortlinks",
  "user_boosters",
]

const REQUIRED_COLUMNS = [
  ["ptc_ads", "start_date"],
  ["ptc_ads", "end_date"],
  ["ptc_views", "user_agent"],
  ["ptc_views", "completed"],
  ["ptc_views", "created_at"],
  ["ptc_views", "view_duration_seconds"],
  ["shortlink_views", "user_agent"],
  ["shortlink_views", "view_duration_ms"],
  ["manual_faucet_claims", "request_id"],
]

const client = new Client({
  connectionString: connectionString
    .replace(/([?&])sslmode=[^&]*/i, "$1")
    .replace(/[?&]$/, ""),
  ssl: /sslmode=require/i.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined,
})

let failures = 0
function fail(message) {
  failures += 1
  console.log(`FAIL ${message}`)
}
function pass(message) {
  console.log(`ok   ${message}`)
}

async function main() {
  await client.connect()
  try {
    const routines = await client.query(
      `SELECT p.proname AS name,
              pg_get_function_identity_arguments(p.oid) AS args,
              p.prosecdef AS security_definer,
              COALESCE(
                (SELECT string_agg(DISTINCT g.grantee, ',' ORDER BY g.grantee)
                 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                 JOIN LATERAL (
                   SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC'
                               ELSE pg_get_userbyid(a.grantee) END AS grantee
                 ) g ON TRUE
                 WHERE a.privilege_type = 'EXECUTE'),
                ''
              ) AS execute_grantees
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])
       ORDER BY p.proname, args`,
      [REWARD_ROUTINES],
    )

    console.log("=== Reward routine EXECUTE grants ===")
    const clientRoles = new Set(["PUBLIC", "anon", "authenticated"])
    for (const row of routines.rows) {
      const grantees = String(row.execute_grantees || "")
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean)
      const exposed = grantees.filter((r) => clientRoles.has(r))
      const label = `${row.name}(${row.args})${row.security_definer ? " [SECURITY DEFINER]" : ""}`
      if (exposed.length > 0) {
        fail(`${label} executable by ${exposed.join(", ")}`)
      } else {
        pass(`${label} grantees=${grantees.join(",") || "none"}`)
      }
    }
    const found = new Set(routines.rows.map((r) => r.name))
    for (const name of REWARD_ROUTINES) {
      if (!found.has(name)) console.log(`--   ${name} not present in this database`)
    }

    console.log("\n=== Reward table client write privileges ===")
    const tableGrants = await client.query(
      `SELECT table_name, grantee, privilege_type
       FROM information_schema.role_table_grants
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
         AND grantee IN ('PUBLIC','anon','authenticated')
         AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
       ORDER BY table_name, grantee, privilege_type`,
      [REWARD_TABLES],
    )
    if (tableGrants.rows.length === 0) {
      pass("no anon/authenticated INSERT/UPDATE/DELETE grants on reward tables")
    } else {
      for (const row of tableGrants.rows) {
        fail(`${row.table_name}: ${row.grantee} holds ${row.privilege_type}`)
      }
    }

    console.log("\n=== Reward table write policies ===")
    const policies = await client.query(
      `SELECT tablename, policyname, cmd, roles::text AS roles,
              COALESCE(qual, '') AS qual, COALESCE(with_check, '') AS with_check
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = ANY($1::text[])
         AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
       ORDER BY tablename, policyname`,
      [REWARD_TABLES],
    )
    // A write policy is only safe if its predicate restricts the caller to the
    // service role or an admin check. Self-scoped predicates such as
    // `auth.uid() = user_id` would let a client forge its own reward rows if it
    // ever regained a table-level privilege, so they must not exist.
    const guarded = /service_role|is_admin\(\)|is_superadmin\(\)|profiles\.role|role = ANY/i
    let unguarded = 0
    for (const row of policies.rows) {
      const predicate = `${row.qual} ${row.with_check}`
      const label = `${row.tablename}: policy ${row.policyname} (${row.cmd})`
      if (guarded.test(predicate)) {
        pass(`${label} restricted to service/admin`)
      } else {
        unguarded += 1
        fail(`${label} predicate is not service/admin restricted: ${predicate.trim().slice(0, 80)}`)
      }
    }
    if (policies.rows.length === 0) {
      pass("no INSERT/UPDATE/DELETE/ALL policies on reward tables")
    } else if (unguarded === 0) {
      pass(`all ${policies.rows.length} reward write policies are service/admin restricted`)
    }

    console.log("\n=== RLS enabled ===")
    const rls = await client.query(
      `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
       ORDER BY c.relname`,
      [REWARD_TABLES],
    )
    for (const row of rls.rows) {
      if (row.rls_enabled) pass(`${row.table_name} RLS enabled`)
      else fail(`${row.table_name} RLS disabled`)
    }

    console.log("\n=== Required columns ===")
    const columns = await client.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'`,
    )
    const columnSet = new Set(columns.rows.map((r) => `${r.table_name}.${r.column_name}`))
    for (const [table, column] of REQUIRED_COLUMNS) {
      if (columnSet.has(`${table}.${column}`)) pass(`${table}.${column}`)
      else fail(`${table}.${column} missing`)
    }

    console.log("\n=== Duplicate reward views (would break unique day indexes) ===")
    for (const [table, keyColumn, timeColumn] of [
      ["ptc_views", "ad_id", "created_at"],
      ["shortlink_views", "shortlink_id", "viewed_at"],
    ]) {
      if (!columnSet.has(`${table}.${keyColumn}`)) {
        console.log(`--   ${table} not present`)
        continue
      }
      const dupes = await client.query(
        `SELECT COUNT(*)::int AS groups
         FROM (
           SELECT user_id, ${keyColumn}, date_trunc('day', ${timeColumn} AT TIME ZONE 'UTC')
           FROM public.${table}
           GROUP BY 1, 2, 3
           HAVING COUNT(*) > 1
         ) d`,
      )
      const groups = dupes.rows[0]?.groups ?? 0
      if (groups === 0) pass(`${table} has no duplicate user/day rows`)
      else fail(`${table} has ${groups} duplicate user/day groups`)
    }

    console.log(`\nfailures=${failures}`)
  } finally {
    await client.end()
  }
  process.exit(failures > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(`verification error: ${error.message}`)
  process.exit(2)
})
