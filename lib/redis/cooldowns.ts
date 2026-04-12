"use server"

import { getRedisClient } from "./client"

// ═══════════════════════════════════════════════════════════════════════════════
// REDIS-BACKED COOLDOWN MANAGER
// Prevents double reward spam and enforces claim cooldowns
// ═══════════════════════════════════════════════════════════════════════════════

export interface CooldownConfig {
  /** Cooldown duration in seconds */
  durationSeconds: number
  /** Key prefix */
  prefix: string
}

// Predefined cooldowns
export const COOLDOWNS = {
  // Double reward - strict cooldown
  DOUBLE_REWARD: { durationSeconds: 600, prefix: "cd:double" }, // 10 minutes
  DOUBLE_REWARD_DAILY: { durationSeconds: 86400, prefix: "cd:double:daily" }, // 24 hours limit

  // Faucet claims
  AUTO_FAUCET: { durationSeconds: 300, prefix: "cd:faucet:auto" }, // 5 minutes
  MANUAL_FAUCET: { durationSeconds: 300, prefix: "cd:faucet:manual" }, // 5 minutes per crypto

  // Shortlinks
  SHORTLINK: { durationSeconds: 60, prefix: "cd:shortlink" }, // 1 minute per shortlink

  // Support us
  SUPPORT_US: { durationSeconds: 300, prefix: "cd:support" }, // 5 minutes

  // Daily bonus
  DAILY_BONUS: { durationSeconds: 86400, prefix: "cd:daily" }, // 24 hours

  // Withdrawals
  WITHDRAWAL: { durationSeconds: 3600, prefix: "cd:withdraw" }, // 1 hour
} as const

export interface CooldownStatus {
  onCooldown: boolean
  remainingSeconds: number
  expiresAt: number | null
}

/**
 * Check if a cooldown is active
 */
export async function checkCooldown(
  identifier: string,
  config: CooldownConfig
): Promise<CooldownStatus> {
  const redis = getRedisClient()

  if (!redis) {
    console.warn("[Cooldown] Redis unavailable")
    return { onCooldown: false, remainingSeconds: 0, expiresAt: null }
  }

  const key = `${config.prefix}:${identifier}`

  try {
    const ttl = await redis.ttl(key)

    if (ttl > 0) {
      return {
        onCooldown: true,
        remainingSeconds: ttl,
        expiresAt: Date.now() + ttl * 1000,
      }
    }

    return { onCooldown: false, remainingSeconds: 0, expiresAt: null }
  } catch (error) {
    console.error("[Cooldown] Check error:", error)
    return { onCooldown: false, remainingSeconds: 0, expiresAt: null }
  }
}

/**
 * Set a cooldown for an identifier
 */
export async function setCooldown(
  identifier: string,
  config: CooldownConfig,
  customDuration?: number
): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  const key = `${config.prefix}:${identifier}`
  const duration = customDuration || config.durationSeconds

  try {
    await redis.set(key, Date.now().toString(), { ex: duration })
  } catch (error) {
    console.error("[Cooldown] Set error:", error)
  }
}

/**
 * Clear a cooldown manually
 */
export async function clearCooldown(identifier: string, config: CooldownConfig): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  const key = `${config.prefix}:${identifier}`
  try {
    await redis.del(key)
  } catch (error) {
    console.error("[Cooldown] Clear error:", error)
  }
}

/**
 * Check and set cooldown atomically - returns true if allowed, false if on cooldown
 */
export async function checkAndSetCooldown(
  identifier: string,
  config: CooldownConfig
): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const redis = getRedisClient()

  if (!redis) {
    console.warn("[Cooldown] Redis unavailable, allowing action")
    return { allowed: true, remainingSeconds: 0 }
  }

  const key = `${config.prefix}:${identifier}`

  try {
    // Try to set only if key doesn't exist (NX = Not eXists)
    const result = await redis.set(key, Date.now().toString(), {
      ex: config.durationSeconds,
      nx: true,
    })

    if (result === "OK") {
      return { allowed: true, remainingSeconds: 0 }
    }

    // Key exists, get TTL
    const ttl = await redis.ttl(key)
    return { allowed: false, remainingSeconds: Math.max(0, ttl) }
  } catch (error) {
    console.error("[Cooldown] Check and set error:", error)
    return { allowed: true, remainingSeconds: 0 }
  }
}

/**
 * Track daily limit with counter (e.g., max 5 double rewards per day)
 */
export async function checkDailyLimit(
  identifier: string,
  maxPerDay: number,
  prefix: string
): Promise<{ allowed: boolean; used: number; remaining: number }> {
  const redis = getRedisClient()

  if (!redis) {
    return { allowed: true, used: 0, remaining: maxPerDay }
  }

  const key = `${prefix}:daily:${identifier}`

  try {
    const current = await redis.get<number>(key) || 0

    if (current >= maxPerDay) {
      return { allowed: false, used: current, remaining: 0 }
    }

    return { allowed: true, used: current, remaining: maxPerDay - current }
  } catch (error) {
    console.error("[Cooldown] Daily limit check error:", error)
    return { allowed: true, used: 0, remaining: maxPerDay }
  }
}

/**
 * Increment daily usage counter
 */
export async function incrementDailyUsage(identifier: string, prefix: string): Promise<number> {
  const redis = getRedisClient()
  if (!redis) return 0

  const key = `${prefix}:daily:${identifier}`

  try {
    const newCount = await redis.incr(key)

    // Set expiry to end of day if this is the first increment
    if (newCount === 1) {
      const now = new Date()
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      const secondsUntilEndOfDay = Math.floor((endOfDay.getTime() - now.getTime()) / 1000)
      await redis.expire(key, secondsUntilEndOfDay)
    }

    return newCount
  } catch (error) {
    console.error("[Cooldown] Increment error:", error)
    return 0
  }
}

/**
 * Get multiple cooldown statuses at once
 */
export async function getMultipleCooldowns(
  identifiers: { id: string; config: CooldownConfig }[]
): Promise<Map<string, CooldownStatus>> {
  const redis = getRedisClient()
  const results = new Map<string, CooldownStatus>()

  if (!redis) {
    identifiers.forEach(({ id }) => {
      results.set(id, { onCooldown: false, remainingSeconds: 0, expiresAt: null })
    })
    return results
  }

  try {
    const pipeline = redis.pipeline()
    identifiers.forEach(({ id, config }) => {
      pipeline.ttl(`${config.prefix}:${id}`)
    })

    const ttls = await pipeline.exec()

    identifiers.forEach(({ id }, index) => {
      const ttl = (ttls[index] as number) || -1
      if (ttl > 0) {
        results.set(id, {
          onCooldown: true,
          remainingSeconds: ttl,
          expiresAt: Date.now() + ttl * 1000,
        })
      } else {
        results.set(id, { onCooldown: false, remainingSeconds: 0, expiresAt: null })
      }
    })

    return results
  } catch (error) {
    console.error("[Cooldown] Multiple check error:", error)
    identifiers.forEach(({ id }) => {
      results.set(id, { onCooldown: false, remainingSeconds: 0, expiresAt: null })
    })
    return results
  }
}
