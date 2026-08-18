// =============================================================================
// ANTI-DRAIN PROTECTION v2.0 - FORTRESS-LEVEL FAUCET SECURITY
// =============================================================================
//
// This module implements multiple layers of protection against:
// 1. Bot attacks (infinite claim attempts)
// 2. Console/DevTools script injection
// 3. Userscript attacks (Tampermonkey, Greasemonkey)
// 4. AI-powered bots
// 5. Rate limit bypass attempts
// 6. Multi-account abuse
// 7. VPN/Proxy/Tor users
// 8. Automated browser tools (Selenium, Puppeteer, Playwright)
//
// =============================================================================

import { createAdminClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import crypto from "crypto"
import { log } from "@/lib/logger"

// =============================================================================
// TYPES
// =============================================================================

export interface AntiDrainValidation {
  isAllowed: boolean
  reason?: string
  riskScore: number
  suspiciousFactors: string[]
  blockDuration?: number // seconds
}

export interface ClaimContext {
  userId: string
  ip: string
  userAgent: string
  fingerprint?: string
  captchaToken?: string
  timestamp: number
  cryptoSymbol: string
  requestHeaders: Record<string, string>
}

// =============================================================================
// CONFIGURATION - ULTRA STRICT LIMITS
// =============================================================================

const LIMITS = {
  // Per-user limits
  MAX_CLAIMS_PER_MINUTE: 1,
  MAX_CLAIMS_PER_HOUR: 30,
  MAX_CLAIMS_PER_DAY: 500,

  // Per-IP limits (stricter)
  MAX_IP_CLAIMS_PER_MINUTE: 2,
  MAX_IP_CLAIMS_PER_HOUR: 50,
  MAX_IP_CLAIMS_PER_DAY: 200,

  // Cooldown
  MIN_COOLDOWN_SECONDS: 60,
  PENALTY_COOLDOWN_SECONDS: 300, // 5 minutes for violations

  // Request timing
  MIN_REQUEST_INTERVAL_MS: 500, // Minimum time between requests
  MAX_REQUEST_RATE_PER_SECOND: 2,

  // Captcha
  CAPTCHA_TOKEN_MAX_AGE_MS: 120000, // 2 minutes

  // Fingerprint
  MAX_USERS_PER_FINGERPRINT: 2,
  MAX_CLAIMS_PER_FINGERPRINT_PER_HOUR: 60,

  // Risk thresholds
  BLOCK_THRESHOLD: 70,
  REVIEW_THRESHOLD: 50,
  WARN_THRESHOLD: 30,

  // Global circuit breaker
  MAX_GLOBAL_CLAIMS_PER_MINUTE: 100,
  CIRCUIT_BREAKER_DURATION_MS: 60000,
}

// In-memory tracking stores (use Redis in production)
const claimTracker = new Map<string, { timestamps: number[]; violations: number }>()
const ipTracker = new Map<string, { timestamps: number[]; violations: number; users: Set<string> }>()
const fingerprintTracker = new Map<string, { timestamps: number[]; users: Set<string> }>()
const globalClaims: number[] = []
const blockedEntities = new Map<string, { until: number; reason: string }>()

// =============================================================================
// BOT DETECTION PATTERNS
// =============================================================================

const BOT_USER_AGENTS = [
  "curl", "wget", "python", "java", "php", "ruby", "go-http", "axios",
  "node-fetch", "puppeteer", "playwright", "selenium", "headless",
  "phantomjs", "slimerjs", "zombie", "nightmare"
]

const SUSPICIOUS_HEADERS = [
  "x-requested-with",
  "x-custom-header",
  "x-automation",
  "x-test"
]

const AUTOMATION_INDICATORS = [
  // Puppeteer/Playwright
  "puppeteer", "playwright", "chromium", "webdriver",
  // Selenium
  "selenium", "webdriver",
  // HeadlessChrome
  "headlesschrome", "headless",
  // PhantomJS
  "phantomjs",
  // Generic
  "bot", "crawler", "spider", "scraper"
]

// =============================================================================
// CORE VALIDATION FUNCTIONS
// =============================================================================

export async function validateClaimRequest(
  context: ClaimContext
): Promise<AntiDrainValidation> {
  const suspiciousFactors: string[] = []
  let riskScore = 0

  try {
    // 1. Check global circuit breaker
    const circuitBreakerResult = checkCircuitBreaker()
    if (!circuitBreakerResult.isAllowed) {
      return {
        isAllowed: false,
        reason: "System temporarily unavailable due to high load",
        riskScore: 100,
        suspiciousFactors: ["circuit_breaker_triggered"],
        blockDuration: Math.ceil(circuitBreakerResult.retryAfter / 1000)
      }
    }

    // 2. Check if entity is blocked
    const blockCheck = checkBlocked(context.userId, context.ip)
    if (blockCheck.blocked) {
      return {
        isAllowed: false,
        reason: blockCheck.reason,
        riskScore: 100,
        suspiciousFactors: ["entity_blocked"],
        blockDuration: blockCheck.remainingSeconds
      }
    }

    // 3. Validate user agent
    const uaCheck = validateUserAgent(context.userAgent)
    riskScore += uaCheck.riskScore
    suspiciousFactors.push(...uaCheck.factors)

    // 4. Check for automation indicators in headers
    const headerCheck = validateHeaders(context.requestHeaders)
    riskScore += headerCheck.riskScore
    suspiciousFactors.push(...headerCheck.factors)

    // 5. Validate request timing
    const timingCheck = validateRequestTiming(context.userId, context.timestamp)
    riskScore += timingCheck.riskScore
    suspiciousFactors.push(...timingCheck.factors)

    // 6. Per-user rate limiting
    const userRateCheck = checkUserRateLimit(context.userId, context.timestamp)
    riskScore += userRateCheck.riskScore
    suspiciousFactors.push(...userRateCheck.factors)
    if (!userRateCheck.allowed) {
      return {
        isAllowed: false,
        reason: userRateCheck.reason || "Rate limit exceeded",
        riskScore,
        suspiciousFactors,
        blockDuration: userRateCheck.retryAfter
      }
    }

    // 7. Per-IP rate limiting
    const ipRateCheck = checkIpRateLimit(context.ip, context.userId, context.timestamp)
    riskScore += ipRateCheck.riskScore
    suspiciousFactors.push(...ipRateCheck.factors)
    if (!ipRateCheck.allowed) {
      return {
        isAllowed: false,
        reason: ipRateCheck.reason || "IP rate limit exceeded",
        riskScore,
        suspiciousFactors,
        blockDuration: ipRateCheck.retryAfter
      }
    }

    // 8. Fingerprint validation (if provided)
    if (context.fingerprint) {
      const fpCheck = checkFingerprintRateLimit(context.fingerprint, context.userId, context.timestamp)
      riskScore += fpCheck.riskScore
      suspiciousFactors.push(...fpCheck.factors)
      if (!fpCheck.allowed) {
        return {
          isAllowed: false,
          reason: fpCheck.reason || "Device limit exceeded",
          riskScore,
          suspiciousFactors,
          blockDuration: fpCheck.retryAfter
        }
      }
    }

    // 9. Captcha token validation
    if (context.captchaToken) {
      const captchaCheck = validateCaptchaToken(context.captchaToken, context.timestamp)
      riskScore += captchaCheck.riskScore
      suspiciousFactors.push(...captchaCheck.factors)
    } else {
      riskScore += 30 // No captcha token is suspicious
      suspiciousFactors.push("no_captcha_token")
    }

    // 10. Database-level checks
    const dbCheck = await performDatabaseChecks(context)
    riskScore += dbCheck.riskScore
    suspiciousFactors.push(...dbCheck.factors)
    if (!dbCheck.allowed) {
      return {
        isAllowed: false,
        reason: dbCheck.reason,
        riskScore,
        suspiciousFactors,
        blockDuration: dbCheck.blockDuration
      }
    }

    // 11. Apply final risk score decision
    if (riskScore >= LIMITS.BLOCK_THRESHOLD) {
      // Block and record
      blockEntity(context.userId, LIMITS.PENALTY_COOLDOWN_SECONDS, "High risk score")
      await recordFraudAttempt(context, riskScore, suspiciousFactors)

      return {
        isAllowed: false,
        reason: "Request blocked for security reasons",
        riskScore,
        suspiciousFactors,
        blockDuration: LIMITS.PENALTY_COOLDOWN_SECONDS
      }
    }

    // 12. Record successful validation
    recordClaim(context.userId, context.ip, context.fingerprint, context.timestamp)
    globalClaims.push(context.timestamp)

    // Clean up old global claims
    const cutoff = Date.now() - 60000
    while (globalClaims.length > 0 && globalClaims[0] < cutoff) {
      globalClaims.shift()
    }

    return {
      isAllowed: true,
      riskScore,
      suspiciousFactors
    }

  } catch (error) {
    log.error("Anti-drain validation error", { error, context: { userId: context.userId, ip: context.ip } })

    // Fail closed on errors
    return {
      isAllowed: false,
      reason: "Validation error",
      riskScore: 50,
      suspiciousFactors: ["validation_error"]
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function checkCircuitBreaker(): { isAllowed: boolean; retryAfter: number } {
  const now = Date.now()
  const cutoff = now - 60000

  // Clean old entries
  while (globalClaims.length > 0 && globalClaims[0] < cutoff) {
    globalClaims.shift()
  }

  if (globalClaims.length >= LIMITS.MAX_GLOBAL_CLAIMS_PER_MINUTE) {
    return { isAllowed: false, retryAfter: LIMITS.CIRCUIT_BREAKER_DURATION_MS }
  }

  return { isAllowed: true, retryAfter: 0 }
}

function checkBlocked(userId: string, ip: string): { blocked: boolean; reason: string; remainingSeconds: number } {
  const now = Date.now()

  // Check user block
  const userBlock = blockedEntities.get(`user:${userId}`)
  if (userBlock && userBlock.until > now) {
    return {
      blocked: true,
      reason: userBlock.reason,
      remainingSeconds: Math.ceil((userBlock.until - now) / 1000)
    }
  }

  // Check IP block
  const ipBlock = blockedEntities.get(`ip:${ip}`)
  if (ipBlock && ipBlock.until > now) {
    return {
      blocked: true,
      reason: ipBlock.reason,
      remainingSeconds: Math.ceil((ipBlock.until - now) / 1000)
    }
  }

  return { blocked: false, reason: "", remainingSeconds: 0 }
}

function blockEntity(identifier: string, durationSeconds: number, reason: string): void {
  blockedEntities.set(`user:${identifier}`, {
    until: Date.now() + durationSeconds * 1000,
    reason
  })
}

function validateUserAgent(userAgent: string): { riskScore: number; factors: string[] } {
  const factors: string[] = []
  let riskScore = 0

  if (!userAgent || userAgent.length < 10) {
    riskScore += 30
    factors.push("missing_or_short_user_agent")
  }

  const lowerUA = userAgent.toLowerCase()

  // Check for bot user agents
  for (const bot of BOT_USER_AGENTS) {
    if (lowerUA.includes(bot)) {
      riskScore += 50
      factors.push(`bot_user_agent:${bot}`)
      break
    }
  }

  // Check for automation indicators
  for (const indicator of AUTOMATION_INDICATORS) {
    if (lowerUA.includes(indicator)) {
      riskScore += 40
      factors.push(`automation_indicator:${indicator}`)
      break
    }
  }

  // Check for missing browser indicators
  const browserIndicators = ["mozilla", "chrome", "safari", "firefox", "edge", "opera"]
  const hasBrowserIndicator = browserIndicators.some(b => lowerUA.includes(b))
  if (!hasBrowserIndicator) {
    riskScore += 20
    factors.push("no_browser_indicator")
  }

  return { riskScore, factors }
}

function validateHeaders(headers: Record<string, string>): { riskScore: number; factors: string[] } {
  const factors: string[] = []
  let riskScore = 0

  // Check for suspicious headers
  for (const header of SUSPICIOUS_HEADERS) {
    if (headers[header]) {
      riskScore += 15
      factors.push(`suspicious_header:${header}`)
    }
  }

  // Check for missing standard headers
  if (!headers["accept"] && !headers["Accept"]) {
    riskScore += 10
    factors.push("missing_accept_header")
  }

  if (!headers["accept-language"] && !headers["Accept-Language"]) {
    riskScore += 10
    factors.push("missing_accept_language")
  }

  return { riskScore, factors }
}

function validateRequestTiming(userId: string, timestamp: number): { riskScore: number; factors: string[] } {
  const factors: string[] = []
  let riskScore = 0

  const userTrack = claimTracker.get(userId)
  if (userTrack && userTrack.timestamps.length > 0) {
    const lastTimestamp = userTrack.timestamps[userTrack.timestamps.length - 1]
    const timeSinceLast = timestamp - lastTimestamp

    // Check minimum interval
    if (timeSinceLast < LIMITS.MIN_REQUEST_INTERVAL_MS) {
      riskScore += 30
      factors.push("request_too_fast")
    }

    // Check for perfectly regular intervals (bot behavior)
    if (userTrack.timestamps.length >= 3) {
      const intervals: number[] = []
      for (let i = 1; i < userTrack.timestamps.length; i++) {
        intervals.push(userTrack.timestamps[i] - userTrack.timestamps[i - 1])
      }

      // Calculate variance
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const variance = intervals.reduce((sum, x) => sum + Math.pow(x - avg, 2), 0) / intervals.length
      const stdDev = Math.sqrt(variance)

      // Very low variance indicates bot-like regularity
      if (stdDev < 500 && intervals.length >= 3) {
        riskScore += 25
        factors.push("too_regular_intervals")
      }
    }
  }

  return { riskScore, factors }
}

function checkUserRateLimit(userId: string, timestamp: number): {
  allowed: boolean
  riskScore: number
  factors: string[]
  reason?: string
  retryAfter?: number
} {
  const factors: string[] = []
  let riskScore = 0

  let userTrack = claimTracker.get(userId)
  if (!userTrack) {
    userTrack = { timestamps: [], violations: 0 }
    claimTracker.set(userId, userTrack)
  }

  // Clean old timestamps
  const minuteAgo = timestamp - 60000
  const hourAgo = timestamp - 3600000
  const dayAgo = timestamp - 86400000

  userTrack.timestamps = userTrack.timestamps.filter(t => t > dayAgo)

  // Count recent claims
  const claimsLastMinute = userTrack.timestamps.filter(t => t > minuteAgo).length
  const claimsLastHour = userTrack.timestamps.filter(t => t > hourAgo).length
  const claimsLastDay = userTrack.timestamps.length

  // Check limits
  if (claimsLastMinute >= LIMITS.MAX_CLAIMS_PER_MINUTE) {
    userTrack.violations++
    riskScore += 20
    factors.push("minute_limit_exceeded")
    return {
      allowed: false,
      riskScore,
      factors,
      reason: "Too many claims. Please wait.",
      retryAfter: 60
    }
  }

  if (claimsLastHour >= LIMITS.MAX_CLAIMS_PER_HOUR) {
    userTrack.violations++
    riskScore += 15
    factors.push("hour_limit_exceeded")
    return {
      allowed: false,
      riskScore,
      factors,
      reason: "Hourly limit reached",
      retryAfter: 3600
    }
  }

  if (claimsLastDay >= LIMITS.MAX_CLAIMS_PER_DAY) {
    riskScore += 10
    factors.push("day_limit_exceeded")
    return {
      allowed: false,
      riskScore,
      factors,
      reason: "Daily limit reached",
      retryAfter: 86400
    }
  }

  // Add risk for high violation count
  if (userTrack.violations > 5) {
    riskScore += userTrack.violations * 3
    factors.push(`high_violation_count:${userTrack.violations}`)
  }

  return { allowed: true, riskScore, factors }
}

function checkIpRateLimit(ip: string, userId: string, timestamp: number): {
  allowed: boolean
  riskScore: number
  factors: string[]
  reason?: string
  retryAfter?: number
} {
  const factors: string[] = []
  let riskScore = 0

  let ipTrack = ipTracker.get(ip)
  if (!ipTrack) {
    ipTrack = { timestamps: [], violations: 0, users: new Set() }
    ipTracker.set(ip, ipTrack)
  }

  ipTrack.users.add(userId)

  // Check for multi-account abuse
  if (ipTrack.users.size > 3) {
    riskScore += (ipTrack.users.size - 3) * 15
    factors.push(`multi_account_ip:${ipTrack.users.size}`)
  }

  // Clean old timestamps
  const hourAgo = timestamp - 3600000
  const dayAgo = timestamp - 86400000
  ipTrack.timestamps = ipTrack.timestamps.filter(t => t > dayAgo)

  // Count recent claims
  const claimsLastMinute = ipTrack.timestamps.filter(t => t > timestamp - 60000).length
  const claimsLastHour = ipTrack.timestamps.filter(t => t > hourAgo).length
  const claimsLastDay = ipTrack.timestamps.length

  if (claimsLastMinute >= LIMITS.MAX_IP_CLAIMS_PER_MINUTE) {
    ipTrack.violations++
    riskScore += 25
    factors.push("ip_minute_limit")
    return {
      allowed: false,
      riskScore,
      factors,
      reason: "Too many requests from this network",
      retryAfter: 60
    }
  }

  if (claimsLastHour >= LIMITS.MAX_IP_CLAIMS_PER_HOUR) {
    riskScore += 20
    factors.push("ip_hour_limit")
    return {
      allowed: false,
      riskScore,
      factors,
      reason: "Network hourly limit reached",
      retryAfter: 1800
    }
  }

  if (claimsLastDay >= LIMITS.MAX_IP_CLAIMS_PER_DAY) {
    riskScore += 15
    factors.push("ip_day_limit")
    return {
      allowed: false,
      riskScore,
      factors,
      reason: "Network daily limit reached",
      retryAfter: 86400
    }
  }

  return { allowed: true, riskScore, factors }
}

function checkFingerprintRateLimit(fingerprint: string, userId: string, timestamp: number): {
  allowed: boolean
  riskScore: number
  factors: string[]
  reason?: string
  retryAfter?: number
} {
  const factors: string[] = []
  let riskScore = 0

  let fpTrack = fingerprintTracker.get(fingerprint)
  if (!fpTrack) {
    fpTrack = { timestamps: [], users: new Set() }
    fingerprintTracker.set(fingerprint, fpTrack)
  }

  fpTrack.users.add(userId)

  // Check for multi-account abuse
  if (fpTrack.users.size > LIMITS.MAX_USERS_PER_FINGERPRINT) {
    riskScore += 40
    factors.push(`multi_account_fingerprint:${fpTrack.users.size}`)
    return {
      allowed: false,
      riskScore,
      factors,
      reason: "Device limit exceeded",
      retryAfter: 3600
    }
  }

  // Check hourly limit
  const hourAgo = timestamp - 3600000
  fpTrack.timestamps = fpTrack.timestamps.filter(t => t > hourAgo)

  if (fpTrack.timestamps.length >= LIMITS.MAX_CLAIMS_PER_FINGERPRINT_PER_HOUR) {
    riskScore += 25
    factors.push("fingerprint_hour_limit")
    return {
      allowed: false,
      riskScore,
      factors,
      reason: "Device hourly limit reached",
      retryAfter: 1800
    }
  }

  return { allowed: true, riskScore, factors }
}

function validateCaptchaToken(token: string, requestTimestamp: number): { riskScore: number; factors: string[] } {
  const factors: string[] = []
  let riskScore = 0

  try {
    // Decode token (assuming base64 encoded JSON)
    const decoded = JSON.parse(atob(token))

    // Check token age
    if (decoded.timestamp && requestTimestamp - decoded.timestamp > LIMITS.CAPTCHA_TOKEN_MAX_AGE_MS) {
      riskScore += 20
      factors.push("captcha_token_expired")
    }

    // Check for required fields
    if (!decoded.challengeId || !decoded.fingerprint) {
      riskScore += 15
      factors.push("invalid_captcha_token")
    }

    // Check behavioral data
    if (decoded.mouseMovements !== undefined && decoded.mouseMovements < 10) {
      riskScore += 20
      factors.push("insufficient_mouse_movement")
    }

    if (decoded.completionTime !== undefined && decoded.completionTime < 2000) {
      riskScore += 25
      factors.push("captcha_completed_too_fast")
    }

  } catch {
    riskScore += 25
    factors.push("captcha_token_parse_error")
  }

  return { riskScore, factors }
}

function recordClaim(userId: string, ip: string, fingerprint: string | undefined, timestamp: number): void {
  // Record user claim
  let userTrack = claimTracker.get(userId)
  if (!userTrack) {
    userTrack = { timestamps: [], violations: 0 }
    claimTracker.set(userId, userTrack)
  }
  userTrack.timestamps.push(timestamp)

  // Record IP claim
  let ipTrack = ipTracker.get(ip)
  if (!ipTrack) {
    ipTrack = { timestamps: [], violations: 0, users: new Set() }
    ipTracker.set(ip, ipTrack)
  }
  ipTrack.timestamps.push(timestamp)

  // Record fingerprint claim
  if (fingerprint) {
    let fpTrack = fingerprintTracker.get(fingerprint)
    if (!fpTrack) {
      fpTrack = { timestamps: [], users: new Set() }
      fingerprintTracker.set(fingerprint, fpTrack)
    }
    fpTrack.timestamps.push(timestamp)
  }
}

async function performDatabaseChecks(context: ClaimContext): Promise<{
  allowed: boolean
  riskScore: number
  factors: string[]
  reason?: string
  blockDuration?: number
}> {
  const factors: string[] = []
  let riskScore = 0

  try {
    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return { allowed: true, riskScore: 0, factors: [] }
    }

    // Check user's fraud score
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("fraud_score, is_banned, ban_reason, role")
      .eq("id", context.userId)
      .single()

    if (profile?.is_banned) {
      return {
        allowed: false,
        riskScore: 100,
        factors: ["user_banned"],
        reason: profile.ban_reason || "Account banned",
        blockDuration: 86400
      }
    }

    if (profile?.fraud_score && profile.fraud_score > 50) {
      riskScore += profile.fraud_score / 2
      factors.push(`high_fraud_score:${profile.fraud_score}`)
    }

    // Check if IP is in blocklist
    const { data: ipBlock } = await adminSupabase
      .from("blocked_ips")
      .select("reason")
      .eq("ip_address", context.ip)
      .eq("is_active", true)
      .single()

    if (ipBlock) {
      return {
        allowed: false,
        riskScore: 100,
        factors: ["ip_blocked"],
        reason: "IP address blocked",
        blockDuration: 86400
      }
    }

    // Check recent claims in database
    const fiveMinutesAgo = new Date(Date.now() - 300000).toISOString()
    const { count: recentClaims } = await adminSupabase
      .from("claims")
      .select("*", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("created_at", fiveMinutesAgo)

    if (recentClaims && recentClaims > 5) {
      riskScore += 15
      factors.push(`high_recent_claims:${recentClaims}`)
    }

    return { allowed: true, riskScore, factors }

  } catch (error) {
    log.error("Database check error", { error })
    // Allow on database errors to prevent blocking legitimate users
    return { allowed: true, riskScore: 5, factors: ["db_check_error"] }
  }
}

async function recordFraudAttempt(
  context: ClaimContext,
  riskScore: number,
  suspiciousFactors: string[]
): Promise<void> {
  try {
    const adminSupabase = createAdminClient()
    if (!adminSupabase) return

    await adminSupabase.from("fraud_attempts").insert({
      user_id: context.userId,
      ip_address: context.ip,
      user_agent: context.userAgent,
      fingerprint: context.fingerprint,
      risk_score: riskScore,
      suspicious_factors: suspiciousFactors,
      crypto_symbol: context.cryptoSymbol,
      request_headers: context.requestHeaders,
      created_at: new Date().toISOString()
    })

    // Increment user's fraud score
    await adminSupabase.rpc("increment_fraud_score", {
      p_user_id: context.userId,
      p_amount: Math.ceil(riskScore / 10)
    }).then(undefined, () => {
      // Fallback if RPC doesn't exist
      adminSupabase
        .from("profiles")
        .update({
          fraud_score: Math.min(100, riskScore)
        })
        .eq("id", context.userId)
    })

  } catch (error) {
    log.error("Failed to record fraud attempt", { error })
  }
}

// =============================================================================
// PERIODIC CLEANUP
// =============================================================================

setInterval(() => {
  const now = Date.now()
  const dayAgo = now - 86400000

  // Clean claim tracker
  for (const [key, track] of claimTracker.entries()) {
    track.timestamps = track.timestamps.filter(t => t > dayAgo)
    if (track.timestamps.length === 0 && track.violations === 0) {
      claimTracker.delete(key)
    }
  }

  // Clean IP tracker
  for (const [key, track] of ipTracker.entries()) {
    track.timestamps = track.timestamps.filter(t => t > dayAgo)
    if (track.timestamps.length === 0) {
      ipTracker.delete(key)
    }
  }

  // Clean fingerprint tracker
  for (const [key, track] of fingerprintTracker.entries()) {
    track.timestamps = track.timestamps.filter(t => t > now - 3600000)
    if (track.timestamps.length === 0) {
      fingerprintTracker.delete(key)
    }
  }

  // Clean blocked entities
  for (const [key, block] of blockedEntities.entries()) {
    if (block.until < now) {
      blockedEntities.delete(key)
    }
  }

}, 300000) // Every 5 minutes
