import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("rate limiter logging is diagnostic, not spam", () => {
  it("never dumps a raw error object per failed call", () => {
    const src = read("lib/redis/rate-limiter.ts")
    // The old catch did console.error("[RateLimit] Error:", error) on EVERY
    // failed call — a multi-line undici stack trace per request, which made CI
    // logs unreadable while tests exercised the broken-endpoint path.
    expect(src).not.toMatch(/console\.error\("\[RateLimit\] Error:", error\)/)
    expect(src).not.toMatch(/console\.error\("\[RateLimit\] Status check error:", error\)/)
  })

  it("logs the breaker transition once, with the failure reason inline", () => {
    const src = read("lib/redis/rate-limiter.ts")
    expect(src).toContain("warnedCircuitOpen")
    expect(src).toMatch(/isRedisCircuitOpen\(\) && !warnedCircuitOpen/)
    expect(src).toMatch(/circuit breaker open; allowing traffic without durable limits/)
  })

  it("keeps fail-open behaviour intact for every failure mode", () => {
    const src = read("lib/redis/rate-limiter.ts")
    // Broken Redis must never lock users out: catch still returns success.
    const catchIdx = src.indexOf("noteRedisFailure()")
    const returnIdx = src.indexOf("return { success: true", catchIdx)
    expect(returnIdx).toBeGreaterThan(-1)
  })
})
