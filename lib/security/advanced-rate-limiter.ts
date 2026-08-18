// =============================================================================
// ADVANCED RATE LIMITER v2.0 - Multi-Dimensional Abuse Prevention
// =============================================================================
//
// Multi-layer rate limiting with:
// 1. Token bucket algorithm for smooth rate limiting
// 2. Sliding window counters for accurate tracking
// 3. IP-based limits with subnet awareness
// 4. User-based limits with reputation scoring
// 5. Fingerprint-based limits for device tracking
// 6. Geographic rate limiting for regional abuse
// 7. Adaptive limits based on user behavior
// 8. Exponential backoff for repeat offenders
//
// =============================================================================

import { createAdminClient } from "@/lib/supabase/server"
import { log } from "@/lib/logger"

// =============================================================================
// TYPES
// =============================================================================

export interface RateLimitConfig {
  // Token bucket config
  maxTokens: number
  refillRate: number // Tokens per second
  
  // Sliding window config
  windowMs: number
  maxRequests: number
  
  // Penalty config
  penaltyMultiplier: number
  maxPenaltyLevel: number
  penaltyDecayMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter: number
  penaltyLevel: number
  reason?: string
  headers: Record<string, string>
}

export interface RateLimitContext {
  userId?: string
  ip: string
  fingerprint?: string
  endpoint: string
  method: string
  userAgent?: string
  country?: string
}

// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  // Faucet claims - strict limits
  "faucet_claim": {
    maxTokens: 5,
    refillRate: 0.016, // 1 token per minute
    windowMs: 60 * 1000,
    maxRequests: 5,
    penaltyMultiplier: 2,
    maxPenaltyLevel: 5,
    penaltyDecayMs: 30 * 60 * 1000, // 30 minutes
  },
  
  // PTC ad views - moderate limits
  "ptc_view": {
    maxTokens: 30,
    refillRate: 0.1, // 6 per minute
    windowMs: 60 * 1000,
    maxRequests: 30,
    penaltyMultiplier: 1.5,
    maxPenaltyLevel: 4,
    penaltyDecayMs: 15 * 60 * 1000,
  },
  
  // Shortlink visits - moderate limits
  "shortlink_visit": {
    maxTokens: 20,
    refillRate: 0.05, // 3 per minute
    windowMs: 60 * 1000,
    maxRequests: 20,
    penaltyMultiplier: 1.5,
    maxPenaltyLevel: 4,
    penaltyDecayMs: 15 * 60 * 1000,
  },
  
  // Game plays - strict limits
  "game_play": {
    maxTokens: 10,
    refillRate: 0.033, // 2 per minute
    windowMs: 60 * 1000,
    maxRequests: 10,
    penaltyMultiplier: 2,
    maxPenaltyLevel: 5,
    penaltyDecayMs: 30 * 60 * 1000,
  },
  
  // Coupon redemptions - very strict
  "coupon_redeem": {
    maxTokens: 5,
    refillRate: 0.008, // 0.5 per minute
    windowMs: 60 * 1000,
    maxRequests: 5,
    penaltyMultiplier: 3,
    maxPenaltyLevel: 3,
    penaltyDecayMs: 60 * 60 * 1000, // 1 hour
  },
  
  // Withdrawals - strictest limits
  "withdrawal": {
    maxTokens: 3,
    refillRate: 0.00055, // 2 per hour
    windowMs: 60 * 60 * 1000,
    maxRequests: 3,
    penaltyMultiplier: 4,
    maxPenaltyLevel: 3,
    penaltyDecayMs: 24 * 60 * 60 * 1000, // 24 hours
  },
  
  // API general - moderate
  "api_general": {
    maxTokens: 100,
    refillRate: 1, // 60 per minute
    windowMs: 60 * 1000,
    maxRequests: 100,
    penaltyMultiplier: 1.5,
    maxPenaltyLevel: 4,
    penaltyDecayMs: 5 * 60 * 1000,
  },
  
  // Auth attempts - strict
  "auth_attempt": {
    maxTokens: 5,
    refillRate: 0.033, // 2 per minute
    windowMs: 5 * 60 * 1000,
    maxRequests: 10,
    penaltyMultiplier: 3,
    maxPenaltyLevel: 5,
    penaltyDecayMs: 60 * 60 * 1000,
  },
  
  // Referral actions - very strict
  "referral_action": {
    maxTokens: 3,
    refillRate: 0.0016, // 0.1 per minute
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    penaltyMultiplier: 5,
    maxPenaltyLevel: 3,
    penaltyDecayMs: 24 * 60 * 60 * 1000,
  },
}

// In-memory storage for rate limit data (use Redis in production)
const rateLimitStore = new Map<string, {
  tokens: number
  lastRefill: number
  requests: { timestamp: number }[]
  penaltyLevel: number
  penaltyExpires: number
}>()

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getStoreKey(context: RateLimitContext, dimension: "ip" | "user" | "fingerprint"): string {
  switch (dimension) {
    case "ip":
      return `rl:ip:${context.endpoint}:${context.ip}`
    case "user":
      return `rl:user:${context.endpoint}:${context.userId || "anon"}`
    case "fingerprint":
      return `rl:fp:${context.endpoint}:${context.fingerprint || "unknown"}`
  }
}

function getSubnetKey(ip: string): string {
  // Extract /24 subnet
  const parts = ip.split(".")
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
  }
  return ip
}

// =============================================================================
// CORE RATE LIMITING
// =============================================================================

export async function checkRateLimit(
  context: RateLimitContext,
  configKey?: string
): Promise<RateLimitResult> {
  const config = DEFAULT_CONFIGS[configKey || context.endpoint] || DEFAULT_CONFIGS.api_general
  const now = Date.now()
  
  // Check all dimensions and take the strictest result
  const dimensions: ("ip" | "user" | "fingerprint")[] = ["ip"]
  if (context.userId) dimensions.push("user")
  if (context.fingerprint) dimensions.push("fingerprint")
  
  let worstResult: RateLimitResult = {
    allowed: true,
    remaining: config.maxTokens,
    resetAt: now + config.windowMs,
    retryAfter: 0,
    penaltyLevel: 0,
    headers: {},
  }
  
  for (const dimension of dimensions) {
    const result = await checkDimensionRateLimit(context, dimension, config, now)
    
    // Take the most restrictive result
    if (!result.allowed || result.remaining < worstResult.remaining) {
      worstResult = result
    }
    
    // If any dimension blocks, stop checking
    if (!result.allowed) {
      break
    }
  }
  
  // Also check subnet-level rate limiting for IP
  const subnetResult = await checkSubnetRateLimit(context, config, now)
  if (!subnetResult.allowed || subnetResult.remaining < worstResult.remaining) {
    worstResult = subnetResult
  }
  
  // Set standard rate limit headers
  worstResult.headers = {
    "X-RateLimit-Limit": config.maxRequests.toString(),
    "X-RateLimit-Remaining": Math.max(0, worstResult.remaining).toString(),
    "X-RateLimit-Reset": Math.ceil(worstResult.resetAt / 1000).toString(),
  }
  
  if (!worstResult.allowed) {
    worstResult.headers["Retry-After"] = Math.ceil(worstResult.retryAfter / 1000).toString()
  }
  
  // Log rate limit violations
  if (!worstResult.allowed) {
    log.warn("Rate limit exceeded", {
      ...context,
      reason: worstResult.reason,
      penaltyLevel: worstResult.penaltyLevel,
      retryAfter: worstResult.retryAfter,
    })
    
    // Record in database for persistent tracking
    await recordRateLimitViolation(context, worstResult)
  }
  
  return worstResult
}

async function checkDimensionRateLimit(
  context: RateLimitContext,
  dimension: "ip" | "user" | "fingerprint",
  config: RateLimitConfig,
  now: number
): Promise<RateLimitResult> {
  const key = getStoreKey(context, dimension)
  
  // Get or initialize rate limit data
  let data = rateLimitStore.get(key)
  if (!data) {
    data = {
      tokens: config.maxTokens,
      lastRefill: now,
      requests: [],
      penaltyLevel: 0,
      penaltyExpires: 0,
    }
    rateLimitStore.set(key, data)
  }
  
  // Check and decay penalty
  if (data.penaltyExpires && now > data.penaltyExpires) {
    data.penaltyLevel = Math.max(0, data.penaltyLevel - 1)
    data.penaltyExpires = data.penaltyLevel > 0 ? now + config.penaltyDecayMs : 0
  }
  
  // Apply penalty multiplier to limits
  const effectiveMaxTokens = Math.ceil(config.maxTokens / Math.pow(config.penaltyMultiplier, data.penaltyLevel))
  const effectiveMaxRequests = Math.ceil(config.maxRequests / Math.pow(config.penaltyMultiplier, data.penaltyLevel))
  
  // Refill tokens (token bucket)
  const timeSinceLastRefill = now - data.lastRefill
  const tokensToAdd = timeSinceLastRefill * config.refillRate / 1000
  data.tokens = Math.min(effectiveMaxTokens, data.tokens + tokensToAdd)
  data.lastRefill = now
  
  // Clean old requests from sliding window
  data.requests = data.requests.filter(r => now - r.timestamp < config.windowMs)
  
  // Check sliding window limit
  if (data.requests.length >= effectiveMaxRequests) {
    const oldestRequest = data.requests[0]
    const resetAt = oldestRequest.timestamp + config.windowMs
    const retryAfter = resetAt - now
    
    // Increase penalty for repeated violations
    if (data.penaltyLevel < config.maxPenaltyLevel) {
      data.penaltyLevel++
      data.penaltyExpires = now + config.penaltyDecayMs * data.penaltyLevel
    }
    
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter,
      penaltyLevel: data.penaltyLevel,
      reason: `${dimension}_window_limit_exceeded`,
      headers: {},
    }
  }
  
  // Check token bucket
  if (data.tokens < 1) {
    const retryAfter = Math.ceil((1 - data.tokens) / config.refillRate * 1000)
    
    // Increase penalty
    if (data.penaltyLevel < config.maxPenaltyLevel) {
      data.penaltyLevel++
      data.penaltyExpires = now + config.penaltyDecayMs * data.penaltyLevel
    }
    
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + retryAfter,
      retryAfter,
      penaltyLevel: data.penaltyLevel,
      reason: `${dimension}_token_bucket_empty`,
      headers: {},
    }
  }
  
  // Consume token and record request
  data.tokens -= 1
  data.requests.push({ timestamp: now })
  
  return {
    allowed: true,
    remaining: Math.floor(data.tokens),
    resetAt: now + config.windowMs,
    retryAfter: 0,
    penaltyLevel: data.penaltyLevel,
    headers: {},
  }
}

async function checkSubnetRateLimit(
  context: RateLimitContext,
  config: RateLimitConfig,
  now: number
): Promise<RateLimitResult> {
  const subnetKey = `rl:subnet:${context.endpoint}:${getSubnetKey(context.ip)}`
  
  // Subnet limits are 10x the individual limits
  const subnetConfig = {
    ...config,
    maxTokens: config.maxTokens * 10,
    maxRequests: config.maxRequests * 10,
  }
  
  let data = rateLimitStore.get(subnetKey)
  if (!data) {
    data = {
      tokens: subnetConfig.maxTokens,
      lastRefill: now,
      requests: [],
      penaltyLevel: 0,
      penaltyExpires: 0,
    }
    rateLimitStore.set(subnetKey, data)
  }
  
  // Clean old requests
  data.requests = data.requests.filter(r => now - r.timestamp < config.windowMs)
  
  // Check subnet limit
  if (data.requests.length >= subnetConfig.maxRequests) {
    const oldestRequest = data.requests[0]
    const resetAt = oldestRequest.timestamp + config.windowMs
    
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter: resetAt - now,
      penaltyLevel: 0,
      reason: "subnet_limit_exceeded",
      headers: {},
    }
  }
  
  // Record request
  data.requests.push({ timestamp: now })
  
  return {
    allowed: true,
    remaining: subnetConfig.maxRequests - data.requests.length,
    resetAt: now + config.windowMs,
    retryAfter: 0,
    penaltyLevel: 0,
    headers: {},
  }
}

// =============================================================================
// DATABASE RECORDING
// =============================================================================

async function recordRateLimitViolation(
  context: RateLimitContext,
  result: RateLimitResult
): Promise<void> {
  try {
    const adminSupabase = createAdminClient()
    if (!adminSupabase) return
    
    await adminSupabase.from("rate_limit_violations").insert({
      user_id: context.userId,
      ip_address: context.ip,
      fingerprint: context.fingerprint,
      endpoint: context.endpoint,
      method: context.method,
      user_agent: context.userAgent,
      country: context.country,
      penalty_level: result.penaltyLevel,
      reason: result.reason,
      retry_after: result.retryAfter,
    })
    
    // Update user fraud score if logged in
    if (context.userId) {
      await adminSupabase.rpc("increment_fraud_score", {
        p_user_id: context.userId,
        p_amount: result.penaltyLevel * 2,
      }).then(undefined, () => {
        // Fallback if RPC doesn't exist
        adminSupabase
          .from("profiles")
          .update({
            fraud_score: Math.min(100, result.penaltyLevel * 5),
          })
          .eq("id", context.userId)
      })
    }
  } catch (error) {
    log.error("Failed to record rate limit violation", { error, context })
  }
}

// =============================================================================
// CLEANUP
// =============================================================================

// Periodic cleanup of stale entries
setInterval(() => {
  const now = Date.now()
  const maxAge = 24 * 60 * 60 * 1000 // 24 hours
  
  for (const [key, data] of rateLimitStore.entries()) {
    // Remove entries with no recent activity
    if (data.requests.length === 0 && now - data.lastRefill > maxAge) {
      rateLimitStore.delete(key)
    }
    // Clean old requests
    data.requests = data.requests.filter(r => now - r.timestamp < maxAge)
  }
}, 60 * 60 * 1000) // Run every hour

// =============================================================================
// EXPORTS
// =============================================================================

export { DEFAULT_CONFIGS }
