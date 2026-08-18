import { getRedisClient } from "./client"

// ═══════════════════════════════════════════════════════════════════════════════
// REDIS-BACKED RATE LIMITER
// Provides real protection using sliding window algorithm with Redis
// ═══════════════════════════════════════════════════════════════════════════════

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number
  /** Window size in seconds */
  windowSeconds: number
  /** Identifier prefix for the rate limit key */
  prefix: string
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

// Predefined rate limit configurations
export const RATE_LIMITS = {
  // Authentication endpoints - strict limits
  AUTH_LOGIN: { limit: 5, windowSeconds: 60, prefix: "rl:auth:login" },
  AUTH_SIGNUP: { limit: 3, windowSeconds: 300, prefix: "rl:auth:signup" },
  AUTH_RESET: { limit: 3, windowSeconds: 3600, prefix: "rl:auth:reset" },

  // Claim endpoints - very strict
  FAUCET_CLAIM: { limit: 1, windowSeconds: 300, prefix: "rl:claim:faucet" },
  MANUAL_FAUCET: { limit: 10, windowSeconds: 3600, prefix: "rl:claim:manual" },
  SHORTLINK_CLAIM: { limit: 30, windowSeconds: 3600, prefix: "rl:claim:shortlink" },
  PTC_CLAIM: { limit: 50, windowSeconds: 3600, prefix: "rl:claim:ptc" },

  // Double reward - prevent spam
  DOUBLE_REWARD: { limit: 5, windowSeconds: 3600, prefix: "rl:double" },

  // Support us - moderate limits
  SUPPORT_US: { limit: 20, windowSeconds: 3600, prefix: "rl:support" },

  // API general
  API_GENERAL: { limit: 100, windowSeconds: 60, prefix: "rl:api" },

  // Withdrawal - strict
  WITHDRAWAL: { limit: 3, windowSeconds: 3600, prefix: "rl:withdraw" },
} as const

// Missing Redis is an explicit local-development fallback. Warn once per
// process rather than flooding logs on every request.
let warnedNoRedis = false

/**
 * Check and update rate limit for a given identifier
 * Uses sliding window algorithm with Redis sorted sets
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const redis = getRedisClient()

  if (!redis) {
    if (!warnedNoRedis) {
      warnedNoRedis = true
      console.warn("[RateLimit] Redis unavailable; using non-durable local-development fallback")
    }
    return { success: true, remaining: config.limit, resetAt: Date.now() + config.windowSeconds * 1000 }
  }

  const key = `${config.prefix}:${identifier}`
  const now = Date.now()
  const windowStart = now - config.windowSeconds * 1000

  try {
    // Use pipeline for atomic operations
    const pipeline = redis.pipeline()

    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart)

    // Count current requests in window
    pipeline.zcard(key)

    // Add current request
    pipeline.zadd(key, { score: now, member: `${now}:${Math.random()}` })

    // Set expiry on the key
    pipeline.expire(key, config.windowSeconds)

    const results = await pipeline.exec()
    const currentCount = (results[1] as number) || 0

    if (currentCount >= config.limit) {
      // Get the oldest entry to calculate retry time
      const oldest = await redis.zrange(key, 0, 0, { withScores: true })
      const oldestTime = oldest.length > 0 ? (oldest[0] as any).score : now
      const retryAfter = Math.ceil((oldestTime + config.windowSeconds * 1000 - now) / 1000)

      return {
        success: false,
        remaining: 0,
        resetAt: oldestTime + config.windowSeconds * 1000,
        retryAfter: Math.max(1, retryAfter),
      }
    }

    return {
      success: true,
      remaining: config.limit - currentCount - 1,
      resetAt: now + config.windowSeconds * 1000,
    }
  } catch (error) {
    console.error("[RateLimit] Error:", error)
    // On error, allow request but log
    return { success: true, remaining: config.limit, resetAt: Date.now() + config.windowSeconds * 1000 }
  }
}

/**
 * Get current rate limit status without incrementing
 */
export async function getRateLimitStatus(
  identifier: string,
  config: RateLimitConfig
): Promise<{ count: number; remaining: number; resetAt: number }> {
  const redis = getRedisClient()

  if (!redis) {
    return { count: 0, remaining: config.limit, resetAt: Date.now() + config.windowSeconds * 1000 }
  }

  const key = `${config.prefix}:${identifier}`
  const now = Date.now()
  const windowStart = now - config.windowSeconds * 1000

  try {
    // Clean old entries and count
    await redis.zremrangebyscore(key, 0, windowStart)
    const count = await redis.zcard(key)

    return {
      count,
      remaining: Math.max(0, config.limit - count),
      resetAt: now + config.windowSeconds * 1000,
    }
  } catch (error) {
    console.error("[RateLimit] Status check error:", error)
    return { count: 0, remaining: config.limit, resetAt: Date.now() + config.windowSeconds * 1000 }
  }
}

/**
 * Reset rate limit for a specific identifier
 */
export async function resetRateLimit(identifier: string, config: RateLimitConfig): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  const key = `${config.prefix}:${identifier}`
  try {
    await redis.del(key)
  } catch (error) {
    console.error("[RateLimit] Reset error:", error)
  }
}

/**
 * Block an identifier completely for a duration
 */
export async function blockIdentifier(
  identifier: string,
  durationSeconds: number,
  reason: string
): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  const key = `blocked:${identifier}`
  try {
    await redis.set(key, JSON.stringify({ reason, blockedAt: Date.now() }), { ex: durationSeconds })
  } catch (error) {
    console.error("[RateLimit] Block error:", error)
  }
}

/**
 * Check if an identifier is blocked
 */
export async function isBlocked(identifier: string): Promise<{ blocked: boolean; reason?: string }> {
  const redis = getRedisClient()
  if (!redis) return { blocked: false }

  const key = `blocked:${identifier}`
  try {
    const data = await redis.get<string>(key)
    if (data) {
      const parsed = typeof data === "string" ? JSON.parse(data) : data
      return { blocked: true, reason: parsed.reason }
    }
    return { blocked: false }
  } catch (error) {
    console.error("[RateLimit] Block check error:", error)
    return { blocked: false }
  }
}
