import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("reward write boundary", () => {
  it("routes privileged server writes through a service-role client", () => {
    const criticalRoutes = [
      "app/api/2fa/setup/route.ts",
      "app/api/2fa/verify/route.ts",
      "app/api/admin/fraud/action/route.ts",
      "app/api/admin/offerwalls/action/route.ts",
      "app/api/admin/users/action/route.ts",
      "app/api/admin/withdrawals/action/route.ts",
      "app/api/cron/cleanup/route.ts",
      "app/api/profile/route.ts",
      "app/auth/callback/route.ts",
    ]

    for (const route of criticalRoutes) {
      const code = source(route)
      expect(code, route).toContain("requireAdminClient")
      expect(code, route).toContain("const adminDb = requireAdminClient()")
    }
  })

  it("keeps client roles out of reward-table writes in the fail-closed migration", () => {
    const migration = source("scripts/090_reward_surface_fail_closed.sql")
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM anon, authenticated")
    expect(migration).toContain("DROP POLICY IF EXISTS")
    expect(migration).toContain("profiles_update_own_identity")
  })

  it("revokes the remaining legacy reward and balance routines", () => {
    const migration = source("scripts/092_legacy_reward_routine_acl.sql")
    expect(migration).toContain("atomic_withdraw")
    expect(migration).toContain("complete_game_session")
    expect(migration).toContain("verify_and_repair_all_balances")
    expect(migration).toContain("process_offerwall_conversion")
    expect(migration).toContain("REVOKE ALL ON FUNCTION")
  })

  it("moves remaining browser stats RPCs behind server routes", () => {
    const migration = source("scripts/093_read_rpc_acl.sql")
    expect(migration).toContain("get_platform_stats")
    expect(migration).toContain("get_leaderboard")
    expect(migration).toContain("REVOKE ALL ON FUNCTION")
  })

  it("discovers forward 09x migrations", () => {
    const runner = source("scripts/migrate.mjs")
    expect(runner).toContain("|9[0-9]")
  })
})
