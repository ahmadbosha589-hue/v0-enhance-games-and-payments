import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it, expect } from "vitest"

const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
const has = (p: string) => existsSync(resolve(process.cwd(), p))

/**
 * S-P2 — cookie-authenticated money mutations must verify CSRF.
 *
 * Root cause this locks in: lib/security/csrf.ts is fully implemented
 * (HMAC double-submit, 1h TTL) but ZERO files imported it — every mutating
 * user endpoint was reachable cross-site with the victim's cookies attached.
 *
 * Design contract:
 *  - GET /api/csrf issues the token (sets the httpOnly cookie + returns the
 *    token for the x-csrf-token header; requires an authenticated session).
 *  - hooks/use-csrf.ts fetches it once and exposes headers for fetch calls.
 *  - Each mutating route calls verifyCSRFFromRequest BEFORE any mutation.
 *  - S2S endpoints (webhooks/postbacks) are EXEMPT — they authenticate by
 *    HMAC signature and carry no user cookies.
 *  - validateCSRFToken compares signatures in constant time.
 */

const MUTATING_ROUTES = [
  "app/api/withdraw/route.ts",
  "app/api/coupons/redeem/route.ts",
  "app/api/boosters/route.ts",
  "app/api/advertise/route.ts",
  "app/api/telegram/link/route.ts",
]

describe("CSRF double-submit is wired into money mutations", () => {
  it("token endpoint exists and is auth-gated", () => {
    expect(has("app/api/csrf/route.ts")).toBe(true)
    const src = read("app/api/csrf/route.ts")
    expect(src).toMatch(/getVerifiedUser|getUser/)
    expect(src).toContain("setCSRFCookie")
  })

  it("client hook exists and sends the x-csrf-token header", () => {
    expect(has("hooks/use-csrf.ts")).toBe(true)
    const src = read("hooks/use-csrf.ts")
    expect(src).toContain("x-csrf-token")
    expect(src).toContain("/api/csrf")
  })

  for (const r of MUTATING_ROUTES) {
    it(`${r} verifies CSRF before mutating`, () => {
      expect(read(r)).toMatch(/verifyCSRFFromRequest/)
    })
  }

  it("advertise PATCH verifies CSRF before campaign state/balance changes", () => {
    const src = read("app/api/advertise/route.ts")
    const patchStart = src.indexOf("export async function PATCH(")
    expect(patchStart).toBeGreaterThanOrEqual(0)
    expect(src.slice(patchStart)).toMatch(/verifyCSRFFromRequest/)
  })

  it("does not use a hardcoded fallback CSRF secret", () => {
    const src = read("lib/security/csrf.ts")
    expect(src).not.toContain("fallback-secret-change-me")
    expect(src).toMatch(/CSRF_SECRET\s*\|\|\s*process\.env\.SUPABASE_JWT_SECRET/)
  })

  it("validateCSRFToken delegates to a constant-time signature validator", () => {
    expect(read("lib/security/csrf-token.ts")).toContain("timingSafeEqual")
  })
})
