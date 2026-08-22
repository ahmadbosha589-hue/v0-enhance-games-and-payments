import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("redis fail-fast contract", () => {
  it("bounds Upstash retries so a broken Redis cannot stall every request", () => {
    const client = read("lib/redis/client.ts")
    // Upstash defaults to 5 attempts with exp(n)*50ms backoff (~1.5s of sleep
    // plus 5 round-trips). On an unreachable Redis that tax is paid by EVERY
    // request that touches the rate limiter, including the proxy hot path.
    expect(client).toContain("retry:")
    expect(client).toMatch(/retries:\s*1/)
  })

  it("bounds each Redis call with an explicit request timeout", () => {
    const client = read("lib/redis/client.ts")
    expect(client).toContain("REDIS_TIMEOUT_MS")
    expect(client).toContain("AbortSignal.timeout")
  })

  it("trips a breaker so repeated Redis failures stop being retried per-request", () => {
    const client = read("lib/redis/client.ts")
    expect(client).toContain("noteRedisFailure")
    expect(client).toContain("isRedisCircuitOpen")
  })

  it("keeps the proxy rate limiter bounded so it cannot delay the response", () => {
    const proxy = read("proxy.ts")
    expect(proxy).toContain("RATE_LIMIT_BUDGET_MS")
    expect(proxy).toContain("Promise.race")
  })
})
