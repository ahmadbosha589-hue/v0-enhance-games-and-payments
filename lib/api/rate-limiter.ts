import { Redis } from '@upstash/redis'

// Initialize Redis client
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

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
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
  isWarning?: boolean
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
    // If Redis fails, allow the request but log the error
    console.error('[RateLimiter] Redis error:', error)
    return {
      allowed: true,
      remaining: effectiveMax,
      resetAt: now + config.windowMs,
    }
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
