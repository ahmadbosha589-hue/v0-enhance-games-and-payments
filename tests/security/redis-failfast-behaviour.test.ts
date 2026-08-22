import { beforeEach, describe, expect, it, vi } from "vitest"

// Point the client at an unroutable address so every call must fail the way a
// broken/stale Upstash endpoint fails in production.
process.env.KV_REST_API_URL = "http://127.0.0.1:1"
process.env.KV_REST_API_TOKEN = "test-token-not-a-real-credential"

describe("redis fail-fast behaviour", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns the fallback quickly instead of burning the retry ladder", async () => {
    const { withRedis, REDIS_TIMEOUT_MS } = await import("@/lib/redis/client")

    const started = Date.now()
    const result = await withRedis(async (redis) => redis.get("probe"), "fallback")
    const elapsed = Date.now() - started

    expect(result).toBe("fallback")
    // The Upstash default (5 attempts, exp(n)*50ms backoff) costs ~4.5s.
    // One bounded attempt must stay near the configured ceiling.
    expect(elapsed).toBeLessThan(REDIS_TIMEOUT_MS + 1500)
  })

  it("opens the circuit after repeated failures so later calls short-circuit", async () => {
    const { withRedis, isRedisCircuitOpen } = await import("@/lib/redis/client")

    expect(isRedisCircuitOpen()).toBe(false)

    for (let i = 0; i < 3; i++) {
      await withRedis(async (redis) => redis.get("probe"), "fallback")
    }

    expect(isRedisCircuitOpen()).toBe(true)

    // Once open, calls must return immediately without touching the network.
    const started = Date.now()
    const result = await withRedis(async (redis) => redis.get("probe"), "fallback")
    expect(result).toBe("fallback")
    expect(Date.now() - started).toBeLessThan(50)
  })

  it("keeps the rate limiter allowing traffic while Redis is broken", async () => {
    const { checkRateLimit } = await import("@/lib/redis/rate-limiter")

    const config = { limit: 5, windowSeconds: 60, prefix: "rl:test" }

    for (let i = 0; i < 4; i++) {
      const result = await checkRateLimit("1.2.3.4", config)
      // Fail OPEN: a broken limiter must never lock real users out.
      expect(result.success).toBe(true)
    }

    // After the breaker arms, the limiter must be effectively free.
    const started = Date.now()
    await checkRateLimit("1.2.3.4", config)
    expect(Date.now() - started).toBeLessThan(50)
  })
})
