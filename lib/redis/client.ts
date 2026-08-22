import { Redis } from "@upstash/redis"

// Singleton Redis client
let redisClient: Redis | null = null

// ═══════════════════════════════════════════════════════════════════════════════
// FAIL-FAST REDIS
//
// @upstash/redis defaults to 5 attempts with an exp(n)*50ms backoff. When the
// REST endpoint is unreachable or the credentials are stale, that default costs
// ~1.5s of sleeping plus 5 dead round-trips — roughly 4.5s in practice — and
// that tax is paid by EVERY caller, including the Next.js proxy hot path which
// runs the rate limiter before any page or API response is produced. The
// symptom users see is not a Redis error (all call sites fall back to allowing
// the request); it is the whole site becoming slow, and RSC streams being cut
// with "Error: Connection closed." once the render exceeds its budget.
//
// So: one attempt, a hard per-call timeout, and a process-level circuit breaker
// so a persistently broken Redis stops being dialled on every request.
// ═══════════════════════════════════════════════════════════════════════════════

/** Hard ceiling for any single Redis REST call. */
export const REDIS_TIMEOUT_MS = 1000

/** Consecutive failures before the breaker opens. */
const CIRCUIT_FAILURE_THRESHOLD = 3

/** How long the breaker stays open before a single probe is allowed again. */
const CIRCUIT_OPEN_MS = 30_000

let consecutiveFailures = 0
let circuitOpenedAt = 0

/**
 * True when Redis has failed enough times in a row that we should skip it
 * entirely rather than pay a timeout per request. Callers MUST treat an open
 * circuit exactly like "no Redis configured" — i.e. apply their existing
 * fallback, never block the user.
 */
export function isRedisCircuitOpen(): boolean {
  if (consecutiveFailures < CIRCUIT_FAILURE_THRESHOLD) return false
  if (Date.now() - circuitOpenedAt >= CIRCUIT_OPEN_MS) {
    // Half-open: allow one probe through. If it fails, noteRedisFailure()
    // re-arms the breaker; if it succeeds, noteRedisSuccess() clears it.
    consecutiveFailures = CIRCUIT_FAILURE_THRESHOLD - 1
    return false
  }
  return true
}

export function noteRedisFailure(): void {
  consecutiveFailures += 1
  if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitOpenedAt = Date.now()
  }
}

export function noteRedisSuccess(): void {
  consecutiveFailures = 0
  circuitOpenedAt = 0
}

/**
 * Run a Redis operation with a bounded budget and breaker bookkeeping.
 * Returns `fallback` on timeout, error, or an open circuit — never throws.
 */
export async function withRedis<T>(
  operation: (redis: Redis) => Promise<T>,
  fallback: T,
): Promise<T> {
  if (isRedisCircuitOpen()) return fallback

  const redis = getRedisClient()
  if (!redis) return fallback

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      operation(redis),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), REDIS_TIMEOUT_MS)
      }),
    ])

    if (result === TIMED_OUT) {
      noteRedisFailure()
      return fallback
    }

    noteRedisSuccess()
    return result as T
  } catch {
    noteRedisFailure()
    return fallback
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const TIMED_OUT = Symbol("redis-timeout")

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient

  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN

  if (!url || !token) {
    console.warn("[Redis] Missing KV_REST_API_URL or KV_REST_API_TOKEN")
    return null
  }

  try {
    redisClient = new Redis({
      url,
      token,
      // One attempt only. Retrying an unreachable endpoint multiplies the
      // latency of every request instead of degrading gracefully.
      retry: { retries: 1, backoff: () => 0 },
      // Belt-and-braces: abort the underlying fetch even if withRedis() is
      // bypassed by a direct getRedisClient() caller.
      signal: () => AbortSignal.timeout(REDIS_TIMEOUT_MS),
    })
    return redisClient
  } catch (error) {
    console.error("[Redis] Failed to create client:", error)
    return null
  }
}

// Helper to check if Redis is available
export function isRedisAvailable(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}
