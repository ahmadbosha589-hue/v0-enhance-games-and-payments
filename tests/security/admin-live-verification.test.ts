import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it, expect } from "vitest"

const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = `${dir}/${e}`
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e === "route.ts") out.push(p)
  }
  return out
}

/**
 * S-P0 — every admin API route must authenticate with a LIVE-verified admin
 * identity (requireAdmin/getVerifiedUser), never a stale offline cookie.
 *
 * Root cause this locks in: admin/funds (balance manipulation) and
 * admin/withdrawals/action (approve/reject/refund payouts) — two MONEY routes
 * — gated on plain supabase.auth.getUser(), which trusts a cookie-derived
 * session that may have been revoked. requireAdmin() in lib/supabase/server.ts
 * performs getVerifiedUser() (live Supabase Auth API check for cookie-derived
 * identities) PLUS the role check, and returns null otherwise.
 */
describe("every admin API route is live-verified", () => {
  const routes = walk("app/api/admin")

  it("found the admin route set (sanity)", () => {
    expect(routes.length).toBeGreaterThanOrEqual(22)
  })

  for (const r of routes) {
    it(`${r} gates on requireAdmin or getVerifiedUser`, () => {
      const src = read(r)
      expect(src).toMatch(/requireAdmin\(|getVerifiedUser\(/)
    })
  }
})
