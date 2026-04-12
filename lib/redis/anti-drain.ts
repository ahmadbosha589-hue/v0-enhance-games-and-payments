"use server"

import { getRedisClient } from "./client"

// ═══════════════════════════════════════════════════════════════════════════════
// REDIS-BACKED ANTI-DRAIN PROTECTION
// Prevents faucet draining by tracking claims across users, IPs, and devices
// ═══════════════════════════════════════════════════════════════════════════════

export interface AntiDrainConfig {
  // Per-user limits
  maxClaimsPerUserPerHour: number
  maxSatoshisPerUserPerDay: number

  // Per-IP limits
  maxClaimsPerIPPerHour: number
  maxUsersPerIP: number

  // Per-device limits
  maxClaimsPerDevicePerHour: number
  maxUsersPerDevice: number

  // Global limits
  maxTotalClaimsPerHour: number
  maxTotalSatoshisPerHour: number

  // Suspicious activity thresholds
  suspiciousClaimVelocity: number // claims per minute
  suspiciousAmountThreshold: number // satoshis
}

const DEFAULT_CONFIG: AntiDrainConfig = {
  maxClaimsPerUserPerHour: 20,
  maxSatoshisPerUserPerDay: 10000,
  maxClaimsPerIPPerHour: 30,
  maxUsersPerIP: 3,
  maxClaimsPerDevicePerHour: 30,
  maxUsersPerDevice: 2,
  maxTotalClaimsPerHour: 10000,
  maxTotalSatoshisPerHour: 1000000,
  suspiciousClaimVelocity: 5,
  suspiciousAmountThreshold: 500,
}

export interface DrainCheckResult {
  allowed: boolean
  reason?: string
  riskScore: number
  flags: string[]
}

// Keys
const KEYS = {
  userClaims: (userId: string) => `drain:user:claims:${userId}`,
  userSatoshis: (userId: string) => `drain:user:sats:${userId}`,
  ipClaims: (ip: string) => `drain:ip:claims:${ip}`,
  ipUsers: (ip: string) => `drain:ip:users:${ip}`,
  deviceClaims: (device: string) => `drain:device:claims:${device}`,
  deviceUsers: (device: string) => `drain:device:users:${device}`,
  globalClaims: () => `drain:global:claims`,
  globalSatoshis: () => `drain:global:sats`,
  flaggedUser: (userId: string) => `drain:flagged:${userId}`,
  suspiciousIP: (ip: string) => `drain:suspicious:ip:${ip}`,
  suspiciousDevice: (device: string) => `drain:suspicious:device:${device}`,
}

/**
 * Check if a claim should be allowed based on anti-drain rules
 */
export async function checkAntiDrain(params: {
  userId: string
  ip: string
  deviceFingerprint?: string
  claimAmount: number
  claimType: string
  config?: Partial<AntiDrainConfig>
}): Promise<DrainCheckResult> {
  const redis = getRedisClient()
  const config = { ...DEFAULT_CONFIG, ...params.config }
  const flags: string[] = []
  let riskScore = 0

  if (!redis) {
    console.warn("[AntiDrain] Redis unavailable, using fallback check")
    return { allowed: true, riskScore: 0, flags: ["redis_unavailable"] }
  }

  const now = Date.now()
  const hourAgo = now - 3600000
  const dayAgo = now - 86400000
  const minuteAgo = now - 60000

  try {
    // ─── CHECK IF USER IS FLAGGED ───
    const isFlagged = await redis.get(KEYS.flaggedUser(params.userId))
    if (isFlagged) {
      return {
        allowed: false,
        reason: "Account flagged for suspicious activity",
        riskScore: 100,
        flags: ["account_flagged"],
      }
    }

    // ─── CHECK IF IP IS SUSPICIOUS ───
    const suspiciousIP = await redis.get(KEYS.suspiciousIP(params.ip))
    if (suspiciousIP) {
      riskScore += 50
      flags.push("suspicious_ip")
    }

    // ─── CHECK IF DEVICE IS SUSPICIOUS ───
    if (params.deviceFingerprint) {
      const suspiciousDevice = await redis.get(KEYS.suspiciousDevice(params.deviceFingerprint))
      if (suspiciousDevice) {
        riskScore += 50
        flags.push("suspicious_device")
      }
    }

    // ─── USER CLAIM VELOCITY CHECK ───
    const userClaimsKey = KEYS.userClaims(params.userId)
    await redis.zremrangebyscore(userClaimsKey, 0, hourAgo)
    const userClaimsHour = await redis.zcard(userClaimsKey)

    if (userClaimsHour >= config.maxClaimsPerUserPerHour) {
      return {
        allowed: false,
        reason: "Hourly claim limit reached",
        riskScore: 80,
        flags: [...flags, "user_hourly_limit"],
      }
    }

    // Check claims in last minute for velocity
    const recentClaims = await redis.zcount(userClaimsKey, minuteAgo, now)
    if (recentClaims >= config.suspiciousClaimVelocity) {
      riskScore += 30
      flags.push("high_velocity")
    }

    // ─── USER DAILY SATOSHI LIMIT ───
    const userSatsKey = KEYS.userSatoshis(params.userId)
    const currentDaySats = await redis.get<number>(userSatsKey) || 0

    if (currentDaySats + params.claimAmount > config.maxSatoshisPerUserPerDay) {
      return {
        allowed: false,
        reason: "Daily satoshi limit reached",
        riskScore: 70,
        flags: [...flags, "user_daily_sats_limit"],
      }
    }

    // ─── IP-BASED CHECKS ───
    const ipClaimsKey = KEYS.ipClaims(params.ip)
    await redis.zremrangebyscore(ipClaimsKey, 0, hourAgo)
    const ipClaimsHour = await redis.zcard(ipClaimsKey)

    if (ipClaimsHour >= config.maxClaimsPerIPPerHour) {
      return {
        allowed: false,
        reason: "Too many claims from this network",
        riskScore: 90,
        flags: [...flags, "ip_hourly_limit"],
      }
    }

    // Check users per IP
    const ipUsersKey = KEYS.ipUsers(params.ip)
    await redis.sadd(ipUsersKey, params.userId)
    await redis.expire(ipUsersKey, 86400)
    const usersOnIP = await redis.scard(ipUsersKey)

    if (usersOnIP > config.maxUsersPerIP) {
      riskScore += 40
      flags.push("multiple_users_ip")

      // Mark IP as suspicious
      await redis.set(KEYS.suspiciousIP(params.ip), "multi_account", { ex: 86400 })
    }

    // ─── DEVICE-BASED CHECKS ───
    if (params.deviceFingerprint) {
      const deviceClaimsKey = KEYS.deviceClaims(params.deviceFingerprint)
      await redis.zremrangebyscore(deviceClaimsKey, 0, hourAgo)
      const deviceClaimsHour = await redis.zcard(deviceClaimsKey)

      if (deviceClaimsHour >= config.maxClaimsPerDevicePerHour) {
        return {
          allowed: false,
          reason: "Too many claims from this device",
          riskScore: 95,
          flags: [...flags, "device_hourly_limit"],
        }
      }

      // Check users per device
      const deviceUsersKey = KEYS.deviceUsers(params.deviceFingerprint)
      await redis.sadd(deviceUsersKey, params.userId)
      await redis.expire(deviceUsersKey, 86400)
      const usersOnDevice = await redis.scard(deviceUsersKey)

      if (usersOnDevice > config.maxUsersPerDevice) {
        riskScore += 50
        flags.push("multiple_users_device")

        // Mark device as suspicious
        await redis.set(KEYS.suspiciousDevice(params.deviceFingerprint), "multi_account", { ex: 86400 })
      }
    }

    // ─── GLOBAL LIMITS ───
    const globalClaimsKey = KEYS.globalClaims()
    await redis.zremrangebyscore(globalClaimsKey, 0, hourAgo)
    const globalClaimsHour = await redis.zcard(globalClaimsKey)

    if (globalClaimsHour >= config.maxTotalClaimsPerHour) {
      return {
        allowed: false,
        reason: "Platform is experiencing high demand. Please try again later.",
        riskScore: 50,
        flags: [...flags, "global_limit"],
      }
    }

    // ─── SUSPICIOUS AMOUNT CHECK ───
    if (params.claimAmount >= config.suspiciousAmountThreshold) {
      riskScore += 20
      flags.push("high_amount")
    }

    // ─── FINAL RISK ASSESSMENT ───
    if (riskScore >= 100) {
      // Flag user for review
      await redis.set(KEYS.flaggedUser(params.userId), JSON.stringify({
        reason: "High risk score",
        score: riskScore,
        flags,
        timestamp: now,
      }), { ex: 86400 })

      return {
        allowed: false,
        reason: "Account flagged for review",
        riskScore,
        flags,
      }
    }

    return {
      allowed: true,
      riskScore,
      flags,
    }
  } catch (error) {
    console.error("[AntiDrain] Error:", error)
    // On error, allow with warning
    return { allowed: true, riskScore: 0, flags: ["check_error"] }
  }
}

/**
 * Record a successful claim for tracking
 */
export async function recordClaim(params: {
  userId: string
  ip: string
  deviceFingerprint?: string
  claimAmount: number
  claimType: string
}): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  const now = Date.now()
  const member = `${now}:${params.claimType}:${params.claimAmount}`

  try {
    const pipeline = redis.pipeline()

    // Record user claim
    pipeline.zadd(KEYS.userClaims(params.userId), { score: now, member })
    pipeline.expire(KEYS.userClaims(params.userId), 7200)

    // Update user daily satoshis
    pipeline.incrby(KEYS.userSatoshis(params.userId), params.claimAmount)
    pipeline.expire(KEYS.userSatoshis(params.userId), 86400)

    // Record IP claim
    pipeline.zadd(KEYS.ipClaims(params.ip), { score: now, member: `${member}:${params.userId}` })
    pipeline.expire(KEYS.ipClaims(params.ip), 7200)

    // Record device claim
    if (params.deviceFingerprint) {
      pipeline.zadd(KEYS.deviceClaims(params.deviceFingerprint), { score: now, member: `${member}:${params.userId}` })
      pipeline.expire(KEYS.deviceClaims(params.deviceFingerprint), 7200)
    }

    // Record global claim
    pipeline.zadd(KEYS.globalClaims(), { score: now, member: `${params.userId}:${member}` })
    pipeline.expire(KEYS.globalClaims(), 7200)

    // Update global satoshis
    pipeline.incrby(KEYS.globalSatoshis(), params.claimAmount)
    pipeline.expire(KEYS.globalSatoshis(), 3600)

    await pipeline.exec()
  } catch (error) {
    console.error("[AntiDrain] Record error:", error)
  }
}

/**
 * Flag a user for suspicious activity
 */
export async function flagUser(userId: string, reason: string, durationSeconds = 86400): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  try {
    await redis.set(KEYS.flaggedUser(userId), JSON.stringify({
      reason,
      timestamp: Date.now(),
    }), { ex: durationSeconds })
  } catch (error) {
    console.error("[AntiDrain] Flag user error:", error)
  }
}

/**
 * Unflag a user
 */
export async function unflagUser(userId: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return

  try {
    await redis.del(KEYS.flaggedUser(userId))
  } catch (error) {
    console.error("[AntiDrain] Unflag error:", error)
  }
}

/**
 * Get anti-drain statistics for admin dashboard
 */
export async function getAntiDrainStats(): Promise<{
  globalClaimsLastHour: number
  globalSatoshisLastHour: number
  suspiciousIPs: number
  flaggedUsers: number
}> {
  const redis = getRedisClient()
  if (!redis) {
    return { globalClaimsLastHour: 0, globalSatoshisLastHour: 0, suspiciousIPs: 0, flaggedUsers: 0 }
  }

  try {
    const now = Date.now()
    const hourAgo = now - 3600000

    await redis.zremrangebyscore(KEYS.globalClaims(), 0, hourAgo)
    const globalClaimsLastHour = await redis.zcard(KEYS.globalClaims())
    const globalSatoshisLastHour = await redis.get<number>(KEYS.globalSatoshis()) || 0

    // Count suspicious IPs and flagged users (approximate via key scan)
    // In production, you'd track these in a separate set
    return {
      globalClaimsLastHour,
      globalSatoshisLastHour,
      suspiciousIPs: 0, // Would need key scanning
      flaggedUsers: 0, // Would need key scanning
    }
  } catch (error) {
    console.error("[AntiDrain] Stats error:", error)
    return { globalClaimsLastHour: 0, globalSatoshisLastHour: 0, suspiciousIPs: 0, flaggedUsers: 0 }
  }
}
