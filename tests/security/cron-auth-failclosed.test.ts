import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Fail-closed cron auth contract (string-level).
 *
 * Regression guard: an audit found `if (cronSecret && authHeader !== ...)`
 * guards on cron trigger routes, which silently ALLOW unauthenticated access
 * whenever CRON_SECRET is unset — exposing real FaucetPay payout processing.
 * Every route under app/api/cron/** must instead:
 *   1. return 503 in production when CRON_SECRET is missing/empty,
 *   2. compare the bearer token with timingSafeEqual (node:crypto),
 *   3. never keep the bare allow-if-unset guard.
 */

const ROUTES = [
  "app/api/cron/process-withdrawals/route.ts",
  "app/api/cron/cleanup/route.ts",
  "app/api/cron/retry-postbacks/route.ts",
  "app/api/cron/run/route.ts",
]

const readSource = (route: string) => readFileSync(resolve(process.cwd(), route), "utf8")

describe("cron routes fail closed on missing CRON_SECRET", () => {
  for (const route of ROUTES) {
    it(`${route} keeps no bare allow-if-unset guard`, () => {
      const source = readSource(route)
      expect(source, `${route} still contains the fail-open "cronSecret &&" guard`).not.toMatch(
        /if\s*\(\s*cronSecret\s*&&/
      )
    })

    it(`${route} compares secrets timing-safely via node:crypto`, () => {
      const source = readSource(route)
      expect(source, `${route} must import from node:crypto`).toContain('from "node:crypto"')
      expect(source, `${route} must call timingSafeEqual`).toContain("timingSafeEqual(")
    })

    it(`${route} returns 503 when the secret is missing in production`, () => {
      const source = readSource(route)
      expect(source, `${route} must fail closed with a 503`).toContain("status: 503")
      expect(source, `${route} must gate on NODE_ENV === "production"`).toMatch(
        /NODE_ENV === "production"/
      )
    })
  }

  it("process-withdrawals carries the full fail-closed pattern", () => {
    const source = readSource(ROUTES[0])
    expect(source).toContain("timingSafeEqual")
    expect(source).toContain("status: 503")
    expect(source).toContain("Cron endpoint is not configured")
    expect(source).not.toContain("if (cronSecret &&")
  })
})
