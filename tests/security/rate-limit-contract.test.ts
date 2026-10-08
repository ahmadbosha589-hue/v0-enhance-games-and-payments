import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it, expect } from "vitest"

const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

/**
 * S-P1 — the rate limiter must survive a missing Upstash configuration by
 * FAILING CLOSED on money/auth routes, and every sensitive endpoint must
 * actually call it.
 *
 * Root cause this locks in: lib/api/rate-limiter.ts constructed
 * `new Redis({ url: process.env.KV_REST_API_URL! })` at module scope —
 * throwing on import without Upstash creds — and its catch block returned
 * allowed:true, so a Redis outage silently removed ALL rate limiting. Only
 * 6 of 219 routes called checkRateLimit; coupons, boosters, and auth were
 * unlimited.
 */
describe("rate limiting is fail-closed and covers the money surface", () => {
  it("limiter fails closed when Redis is unconfigured", () => {
    const src = read("lib/api/rate-limiter.ts")
    // No non-null assertions on the KV env vars
    expect(src).not.toMatch(/KV_REST_API_URL!/)
    expect(src).not.toMatch(/KV_REST_API_TOKEN!/)
    // Null-guard before the try block
    expect(src).toMatch(/if \(!redis\)/)
    // Default path denies
    expect(src).toMatch(/allowed: false, remaining: 0/)
    // Runtime Redis errors also honor failOpen instead of blanket allow
    expect(src).not.toMatch(
      /Redis error:[\s\S]{0,120}allowed: true,\s*remaining: effectiveMax,\s*resetAt: now \+ config\.windowMs,\s*\}/,
    )
  })

  for (const route of [
    "app/api/coupons/redeem/route.ts",
    "app/api/boosters/route.ts",
    "app/api/claim/route.ts",
    "app/api/withdraw/route.ts",
    "app/api/manual-faucet/claim/route.ts",
  ]) {
    it(`${route} calls checkRateLimit`, () => {
      expect(read(route)).toContain("checkRateLimit")
    })
  }
})
