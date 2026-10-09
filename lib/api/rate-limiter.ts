import { Redis } from '@upstash/redis'

// Initialize Redis client — lazily: without Upstash credentials the client is
// null and checkRateLimit FAILS CLOSED for money/auth routes (failOpen: true
// opts read-only routes into allow-with-warning instead). Constructing lazily
// also means importing this module can no longer throw on a Vercel cold start
// when KV vars are unset.
const redisUrl = process.env.KV_REST_API_URL
const redisToken = process.env.KV_REST_API_TOKEN
const redis: Redis | null =
  redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null

interface RateLimitEntry {
  count: number
  resetAt: number
  violations: number
  lastViolationAt: number
}

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  burstAllowance?: number // Extra requests allowed for burst traffic
  violationMultiplier?: number // Multiplier for repeat offenders
  /**
   * Behavior when Redis is unavailable (unconfigured or erroring).
   * Default (undefined/false): DENY — correct for money/auth routes where an
   * open gate means unlimited claims/withdrawals. Set true ONLY for read-only
   * routes where locking every user out is worse than no limit.
   */
  failOpen?: boolean
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
  isWarning?: boolean
  /** Present when the check was denied because the limiter backend itself
   *  is unavailable (Redis/KV unconfigured) — as opposed to the caller
   *  genuinely exceeding the limit. Routes surface this distinctly so the
   *  operator gets "configure KV" instead of users getting "slow down". */
  reason?: "limiter-unavailable"
}

// Generate Redis key for rate limiting
function getRateLimitKey(key: string): string {
  return `ratelimit:${key}`
}

export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const now = Date.now()
  const redisKey = getRateLimitKey(key)
  const burstAllowance = config.burstAllowance ?? Math.floor(config.maxRequests * 0.2)
  const effectiveMax = config.maxRequests + burstAllowance
  const ttlSeconds = Math.ceil(config.windowMs / 1000) + 60 // Add 60s buffer for violations tracking

  // FAIL CLOSED when Redis is unconfigured: money/auth routes must not run
  // unlimited just because Upstash creds are missing. Only routes that opt in
  // with failOpen (read-only) are allowed through with a warning.
  if (!redis) {
    if (config.failOpen) {
      console.warn(`[RateLimiter] Redis unconfigured — allowing (failOpen): ${key}`)
      return { allowed: true, remaining: config.maxRequests, resetAt: now + config.windowMs, isWarning: true }
    }
    console.warn(`[RateLimiter] Redis unconfigured — DENYING (fail closed): ${key}`)
    return { allowed: false, remaining: 0, resetAt: now + 60_000, retryAfter: 60, reason: "limiter-unavailable" }
  }

  try {
    // Get existing entry from Redis
    const entry = await redis.get<RateLimitEntry>(redisKey)

    if (!entry || entry.resetAt <= now) {
      // Create new entry - preserve violations if recent
      const violations = entry && now - entry.lastViolationAt < 86400000 ? entry.violations : 0
      const resetAt = now + config.windowMs
      const newEntry: RateLimitEntry = {
        count: 1,
        resetAt,
        violations,
        lastViolationAt: entry?.lastViolationAt || 0
      }

      await redis.set(redisKey, newEntry, { ex: ttlSeconds })

      return {
        allowed: true,
        remaining: effectiveMax - 1,
        resetAt,
      }
    }

    const violationMultiplier = config.violationMultiplier ?? 0.8
    const adjustedMax = entry.violations > 0
      ? Math.floor(effectiveMax * Math.pow(violationMultiplier, Math.min(entry.violations, 5)))
      : effectiveMax

    // Check if in burst territory (warning zone)
    if (entry.count >= config.maxRequests && entry.count < adjustedMax) {
      entry.count++
      await redis.set(redisKey, entry, { ex: ttlSeconds })

      return {
        allowed: true,
        remaining: adjustedMax - entry.count,
        resetAt: entry.resetAt,
        isWarning: true,
      }
    }

    // Check if rate limited
    if (entry.count >= adjustedMax) {
      // Record violation
      entry.violations++
      entry.lastViolationAt = now
      await redis.set(redisKey, entry, { ex: 86400 }) // Keep violations for 24 hours

      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      }
    }

    // Normal increment
    entry.count++
    await redis.set(redisKey, entry, { ex: ttlSeconds })

    return {
      allowed: true,
      remaining: adjustedMax - entry.count,
      resetAt: entry.resetAt,
    }
  } catch (error) {
    // Redis erroring at runtime: same policy as unconfigured — money/auth
    // routes fail closed; only failOpen (read-only) routes pass through.
    console.error('[RateLimiter] Redis error:', error)
    if (config.failOpen) {
      return { allowed: true, remaining: effectiveMax, resetAt: now + config.windowMs, isWarning: true }
    }
    return { allowed: false, remaining: 0, resetAt: now + 60_000, retryAfter: 60 }
  }
}

// Synchronous fallback for cases where async isn't possible
// Uses a simple in-memory store as last resort
const fallbackStore = new Map<string, RateLimitEntry>()

export function checkRateLimitSync(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const entry = fallbackStore.get(key)
  const burstAllowance = config.burstAllowance ?? Math.floor(config.maxRequests * 0.2)
  const effectiveMax = config.maxRequests + burstAllowance

  // Clean up occasionally
  if (Math.random() < 0.01) {
    for (const [k, e] of fallbackStore.entries()) {
      if (e.resetAt <= now && now - e.lastViolationAt > 86400000) {
        fallbackStore.delete(k)
      }
    }
  }

  if (!entry || entry.resetAt <= now) {
    const violations = entry && now - entry.lastViolationAt < 86400000 ? entry.violations : 0
    const resetAt = now + config.windowMs
    fallbackStore.set(key, { count: 1, resetAt, violations, lastViolationAt: entry?.lastViolationAt || 0 })
    return { allowed: true, remaining: effectiveMax - 1, resetAt }
  }

  const violationMultiplier = config.violationMultiplier ?? 0.8
  const adjustedMax = entry.violations > 0
    ? Math.floor(effectiveMax * Math.pow(violationMultiplier, Math.min(entry.violations, 5)))
    : effectiveMax

  if (entry.count >= adjustedMax) {
    entry.violations++
    entry.lastViolationAt = now
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count++
  return {
    allowed: true,
    remaining: adjustedMax - entry.count,
    resetAt: entry.resetAt,
    isWarning: entry.count >= config.maxRequests,
  }
}

export async function resetRateLimitViolations(key: string): Promise<void> {
  if (!redis) return // Nothing to reset when the limiter is fail-closed offline
  const redisKey = getRateLimitKey(key)
  try {
    const entry = await redis.get<RateLimitEntry>(redisKey)
    if (entry) {
      entry.violations = 0
      await redis.set(redisKey, entry, { ex: Math.ceil((entry.resetAt - Date.now()) / 1000) + 60 })
    }
  } catch (error) {
    console.error('[RateLimiter] Failed to reset violations:', error)
  }
}

export const RATE_LIMITS = {
  claim: { maxRequests: 12, windowMs: 60 * 1000, burstAllowance: 3 }, // 12+3 per minute
  withdrawal: { maxRequests: 5, windowMs: 60 * 60 * 1000, burstAllowance: 1 }, // 5+1 per hour
  login: { maxRequests: 10, windowMs: 15 * 60 * 1000, burstAllowance: 5 }, // 10+5 per 15 minutes
  api: { maxRequests: 100, windowMs: 60 * 1000, burstAllowance: 20 }, // 100+20 per minute
  referral: { maxRequests: 20, windowMs: 60 * 1000, burstAllowance: 5 }, // 20+5 per minute
  faucetpayVerify: { maxRequests: 3, windowMs: 60 * 1000, burstAllowance: 1 }, // Strict for FaucetPay API
  passwordReset: { maxRequests: 3, windowMs: 3600 * 1000, burstAllowance: 0 }, // Very strict
}
