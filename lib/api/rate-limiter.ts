interface RateLimitEntry {
  count: number
  resetAt: number
  violations: number
  lastViolationAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

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

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitStore.get(key)
  const burstAllowance = config.burstAllowance ?? Math.floor(config.maxRequests * 0.2) // 20% burst by default
  const effectiveMax = config.maxRequests + burstAllowance

  // Clean up expired entries periodically
  if (Math.random() < 0.01) {
    cleanupExpiredEntries()
  }

  if (!entry || entry.resetAt <= now) {
    // Create new entry - reset violations if it's been a while
    const violations = entry && now - entry.lastViolationAt < 86400000 ? entry.violations : 0
    const resetAt = now + config.windowMs
    rateLimitStore.set(key, { count: 1, resetAt, violations, lastViolationAt: entry?.lastViolationAt || 0 })
    return {
      allowed: true,
      remaining: effectiveMax - 1,
      resetAt,
    }
  }

  const violationMultiplier = config.violationMultiplier ?? 0.8
  const adjustedMax =
    entry.violations > 0
      ? Math.floor(effectiveMax * Math.pow(violationMultiplier, Math.min(entry.violations, 5)))
      : effectiveMax

  if (entry.count >= config.maxRequests && entry.count < adjustedMax) {
    entry.count++
    return {
      allowed: true,
      remaining: adjustedMax - entry.count,
      resetAt: entry.resetAt,
      isWarning: true, // Let the caller know they're in burst territory
    }
  }

  if (entry.count >= adjustedMax) {
    // Record violation
    entry.violations++
    entry.lastViolationAt = now

    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    }
  }

  entry.count++
  return {
    allowed: true,
    remaining: adjustedMax - entry.count,
    resetAt: entry.resetAt,
  }
}

function cleanupExpiredEntries() {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    // Keep entries with violations for 24 hours even if window expired
    if (entry.resetAt <= now && now - entry.lastViolationAt > 86400000) {
      rateLimitStore.delete(key)
    }
  }
}

export function resetRateLimitViolations(key: string): void {
  const entry = rateLimitStore.get(key)
  if (entry) {
    entry.violations = 0
  }
}

export const RATE_LIMITS = {
  claim: { maxRequests: 12, windowMs: 60 * 1000, burstAllowance: 3 }, // 12+3 per minute
  withdrawal: { maxRequests: 5, windowMs: 60 * 60 * 1000, burstAllowance: 1 }, // 5+1 per hour
  login: { maxRequests: 10, windowMs: 15 * 60 * 1000, burstAllowance: 5 }, // 10+5 per 15 minutes (generous for typos)
  api: { maxRequests: 100, windowMs: 60 * 1000, burstAllowance: 20 }, // 100+20 per minute
  referral: { maxRequests: 20, windowMs: 60 * 1000, burstAllowance: 5 }, // 20+5 per minute
  faucetpayVerify: { maxRequests: 3, windowMs: 60 * 1000, burstAllowance: 1 }, // Strict for FaucetPay API calls
  passwordReset: { maxRequests: 3, windowMs: 3600 * 1000, burstAllowance: 0 }, // Very strict
}
