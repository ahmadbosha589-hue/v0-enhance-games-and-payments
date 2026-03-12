import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { claimRequestSchema } from "@/lib/api/validators"
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/rate-limiter"
import { CLAIM_CONFIG } from "@/lib/constants/config"
import { checkIPAddress, getIPClaimsInLastHour } from "@/lib/security/ip-check"
import { verifyTurnstileToken } from "@/lib/captcha/turnstile"
import { log } from "@/lib/logger"
import { validateSecurityServerSide, banUserIfNeeded, type ClientSecurityPayload } from "@/lib/security/server-validation"

const TURNSTILE_ENABLED = !!process.env.TURNSTILE_SECRET_KEY

function calculateClaimAmount(streak: number): {
  base: number
  streakBonus: number
  total: number
} {
  // Random amount between 2 and 6 satoshis (MAX 6 SATS - stricter limits)
  // Users should use offerwalls and shortlinks for more earnings
  const base = Math.floor(
    CLAIM_CONFIG.baseAmountSatoshis +
    Math.random() * (CLAIM_CONFIG.maxAmountSatoshis - CLAIM_CONFIG.baseAmountSatoshis + 1),
  )

  // No streak bonus - encourages users to use other earning methods
  const streakBonus = 0
  const total = Math.min(base, 6) // Hard cap at 6 satoshis per claim

  return { base, streakBonus, total }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Operation timed out")), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise])
}

function calculateStreak(lastClaimAt: string | null, currentStreak: number): number {
  if (!lastClaimAt) {
    return 1 // First claim ever
  }

  const lastClaim = new Date(lastClaimAt)
  const now = new Date()

  // Get dates in UTC to compare calendar days
  const lastClaimDate = new Date(lastClaim.toISOString().split("T")[0])
  const todayDate = new Date(now.toISOString().split("T")[0])

  // Calculate the difference in days
  const daysDiff = Math.floor((todayDate.getTime() - lastClaimDate.getTime()) / (1000 * 60 * 60 * 24))

  if (daysDiff === 0) {
    // Same calendar day - keep current streak (don't increment)
    return currentStreak || 1
  } else if (daysDiff === 1) {
    // Consecutive day - increment streak
    return Math.min((currentStreak || 0) + 1, CLAIM_CONFIG.maxStreakDays)
  } else {
    // More than 1 day gap - reset streak to 1
    return 1
  }
}

export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const headersList = await headers()

    // Handle case where Supabase clients couldn't be created
    if (!supabase || !adminSupabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
    }

    // Get authenticated user with timeout
    let user
    try {
      const { data } = await withTimeout(supabase.auth.getUser(), 8000)
      user = data.user
    } catch (error) {
      log.error("Auth timeout in claim", { error })
      return NextResponse.json({ error: "Authentication service unavailable. Please try again." }, { status: 503 })
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get IP address
    const forwarded = headersList.get("x-forwarded-for")
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : headersList.get("x-real-ip") || "127.0.0.1"

    // Rate limiting by user
    const userRateLimit = checkRateLimit(`claim:user:${user.id}`, RATE_LIMITS.claim)
    if (!userRateLimit.allowed) {
      log.warn("Claim rate limited by user", { userId: user.id, retryAfter: userRateLimit.retryAfter })
      return NextResponse.json(
        { error: "Too many requests", retryAfter: userRateLimit.retryAfter },
        { status: 429, headers: { "Retry-After": String(userRateLimit.retryAfter) } },
      )
    }

    if (userRateLimit.isWarning) {
      log.info("User in rate limit warning zone", { userId: user.id, remaining: userRateLimit.remaining })
    }

    // Rate limiting by IP
    const ipRateLimit = checkRateLimit(`claim:ip:${ipAddress}`, {
      maxRequests: 30,
      windowMs: 60000,
      burstAllowance: 10,
    })
    if (!ipRateLimit.allowed) {
      log.warn("Claim rate limited by IP", { ip: ipAddress, userId: user.id })
      return NextResponse.json({ error: "Too many requests from this IP" }, { status: 429 })
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const validatedData = claimRequestSchema.safeParse(body)

    if (TURNSTILE_ENABLED && validatedData.success && validatedData.data.captchaToken) {
      const captchaResult = await verifyTurnstileToken(validatedData.data.captchaToken, ipAddress)
      if (!captchaResult.success) {
        log.warn("CAPTCHA verification failed", { userId: user.id, errors: captchaResult.errorCodes })
        return NextResponse.json({ error: "CAPTCHA verification failed" }, { status: 400 })
      }
    }

    // Enhanced anti-bot verification check
    if (validatedData.success && validatedData.data.captchaToken) {
      try {
        // Try to decode the enhanced token (base64 JSON)
        const tokenStr = validatedData.data.captchaToken
        if (tokenStr.startsWith("ey")) { // base64 JSON starts with 'ey' typically
          const decoded = JSON.parse(atob(tokenStr))

          // Verify timestamp is recent (within 5 minutes)
          if (decoded.ts && Date.now() - decoded.ts > 5 * 60 * 1000) {
            log.warn("Stale verification token", { userId: user.id, age: Date.now() - decoded.ts })
            return NextResponse.json({ error: "Verification expired. Please verify again." }, { status: 400 })
          }

          // Check behavior score
          if (decoded.s !== undefined && decoded.s < 30) {
            log.warn("Low behavior score in claim", { userId: user.id, score: decoded.s })
            return NextResponse.json({
              error: "Suspicious activity detected. Please complete verification again.",
              code: "LOW_BEHAVIOR_SCORE"
            }, { status: 403 })
          }

          // Check for unrealistic verification duration (< 3 seconds is bot-like)
          if (decoded.d !== undefined && decoded.d < 3000) {
            log.warn("Unrealistically fast verification", { userId: user.id, duration: decoded.d })
            return NextResponse.json({
              error: "Verification completed too quickly. Please try again.",
              code: "TOO_FAST"
            }, { status: 403 })
          }
        }
      } catch {
        // Token might be a regular Turnstile token, that's fine
      }
    }

    const ipCheck = await checkIPAddress(ipAddress, {
      timezone: validatedData.success ? validatedData.data.clientTimezone : undefined,
      webrtcIPs: validatedData.success ? validatedData.data.webrtcIPs : undefined,
      userAgent: headersList.get("user-agent") || undefined,
    })
    if (ipCheck.isBlocked) {
      log.warn("Blocked IP attempted claim", { ip: ipAddress, userId: user.id, reason: ipCheck.reason })
      return NextResponse.json(
        {
          error: ipCheck.isVPN || ipCheck.isProxy || ipCheck.isTor
            ? "VPN/Proxy detected. Please disable your VPN or proxy to claim rewards."
            : "Access denied",
          code: "VPN_BLOCKED",
        },
        { status: 403 },
      )
    }

    const ipClaimsLimit = ipCheck.confidence === "high" ? 25 : ipCheck.riskScore > 20 ? 15 : 20
    const ipClaimsLastHour = await getIPClaimsInLastHour(ipAddress)
    if (ipClaimsLastHour >= ipClaimsLimit) {
      log.warn("IP exceeded hourly claim limit", { ip: ipAddress, claims: ipClaimsLastHour, limit: ipClaimsLimit })
      return NextResponse.json({ error: "Too many claims from this IP" }, { status: 429 })
    }

    let profile
    try {
      const { data, error } = await withTimeout(
        adminSupabase.from("profiles").select("*").eq("id", user.id).single(),
        8000,
      )
      if (error) throw error
      profile = data
    } catch (error) {
      log.error("Profile fetch failed in claim", { error, userId: user.id })
      return NextResponse.json(
        {
          error: "Unable to load profile. Please refresh the page and try again.",
          code: "PROFILE_LOAD_FAILED",
        },
        { status: 503 },
      )
    }

    if (!profile) {
      return NextResponse.json(
        {
          error: "Profile not found. Please refresh the page or re-login.",
          code: "PROFILE_NOT_FOUND",
        },
        { status: 404 },
      )
    }

    // ── ULTIMATE SERVER-SIDE SECURITY VALIDATION ──
    // Never trust client - validate everything server-side
    const securityPayload: ClientSecurityPayload = {
      fingerprint: validatedData.success ? validatedData.data.fingerprint?.visitorId : undefined,
      behaviorScore: validatedData.success ? validatedData.data.behaviorScore : undefined,
      timestamp: Date.now(),
      timezone: validatedData.success ? validatedData.data.clientTimezone : undefined,
      webrtcIPs: validatedData.success ? validatedData.data.webrtcIPs : undefined,
      verificationDuration: validatedData.success ? validatedData.data.verificationDuration : undefined,
      mouseMovements: validatedData.success ? validatedData.data.mouseMovements : undefined,
      hardwareConcurrency: validatedData.success ? validatedData.data.hardwareConcurrency : undefined,
      deviceMemory: validatedData.success ? validatedData.data.deviceMemory : undefined,
      pluginCount: validatedData.success ? validatedData.data.pluginCount : undefined,
      touchSupport: validatedData.success ? validatedData.data.touchSupport : undefined,
      detectedThreats: validatedData.success ? validatedData.data.detectedThreats : undefined,
    }

    const serverValidation = await validateSecurityServerSide(user.id, securityPayload)

    // Auto-ban if needed
    if (serverValidation.banReason) {
      const banned = await banUserIfNeeded(user.id, serverValidation)
      if (banned) {
        log.error("User auto-banned during claim", {
          userId: user.id,
          reason: serverValidation.banReason,
          flags: serverValidation.flags,
          score: serverValidation.riskScore,
          threatLevel: serverValidation.threatLevel,
          correlatedThreats: serverValidation.correlatedThreats,
          serverFingerprint: serverValidation.serverFingerprint,
        })
        return NextResponse.json({
          error: "Account has been suspended due to policy violation.",
          code: "ACCOUNT_BANNED",
        }, { status: 403 })
      }
    }

    // Block high-risk requests
    if (serverValidation.isBlocked) {
      log.warn("Server validation blocked claim", {
        userId: user.id,
        flags: serverValidation.flags,
        score: serverValidation.riskScore,
        confidence: serverValidation.confidence,
        threatLevel: serverValidation.threatLevel,
        correlatedThreats: serverValidation.correlatedThreats,
      })
      return NextResponse.json({
        error: "Security check failed. Please try again or contact support.",
        code: "SECURITY_BLOCKED",
      }, { status: 403 })
    }

    // Force logout for suspicious activity
    if (serverValidation.shouldLogout) {
      log.warn("Server validation forcing logout", {
        userId: user.id,
        flags: serverValidation.flags,
        score: serverValidation.riskScore,
      })
      return NextResponse.json({
        error: "Session terminated for security reasons. Please log in again.",
        code: "FORCE_LOGOUT",
      }, { status: 401 })
    }

    // Security checks
    if (profile.status === "banned" || profile.banned_at) {
      return NextResponse.json({ error: "Account is suspended" }, { status: 403 })
    }

    if (profile.status !== "active") {
      return NextResponse.json({ error: "Account is not active" }, { status: 403 })
    }

    if (profile.adblock_flagged === true) {
      log.warn("Adblock-flagged user attempted claim", { userId: user.id })
      return NextResponse.json(
        {
          error: "Claims are blocked due to ad blocker usage. Please disable your ad blocker and contact support.",
          code: "ADBLOCK_FLAGGED",
        },
        { status: 403 },
      )
    }

    if (profile.fraud_flags && Array.isArray(profile.fraud_flags)) {
      const hasAdblockFlag = profile.fraud_flags.some(
        (flag: any) =>
          flag.type === "adblock" || flag.reason?.includes("adblock") || flag.reason?.includes("ad blocker"),
      )
      if (hasAdblockFlag) {
        log.warn("User with adblock fraud flag attempted claim", { userId: user.id, flags: profile.fraud_flags })
        return NextResponse.json(
          {
            error: "Claims are blocked due to ad blocker usage. Please disable your ad blocker and contact support.",
            code: "ADBLOCK_FLAGGED",
          },
          { status: 403 },
        )
      }
    }

    let claimFraudScore = profile.fraud_score || 0

    // Only add IP-based penalties if high confidence
    if (ipCheck.confidence !== "low") {
      if (ipCheck.isVPN) claimFraudScore += 10 // Reduced from 20
      if (ipCheck.isProxy) claimFraudScore += 15 // Reduced from 25
      if (ipCheck.isTor) claimFraudScore += 30 // Reduced from 40
      if (ipCheck.isDatacenter) claimFraudScore += 10 // Reduced from 15
    }
    claimFraudScore += Math.floor(ipCheck.riskScore * 0.5) // Half weight on risk score

    const blockThreshold = ipCheck.confidence === "high" ? 90 : 95
    if (claimFraudScore >= blockThreshold) {
      log.error("Auto-blocked high fraud score claim", {
        userId: user.id,
        score: claimFraudScore,
        confidence: ipCheck.confidence,
      })
      return NextResponse.json({ error: "Account flagged for review" }, { status: 403 })
    }

    // ── SERVER-SIDE COOLDOWN VALIDATION ──────────────────────────────────────
    // This is the authoritative check. The client timer is UI-only and can be
    // bypassed. We always enforce the cooldown on the server regardless of
    // what the client reports.
    if (profile.last_claim_at) {
      const lastClaimMs = new Date(profile.last_claim_at).getTime()
      const cooldownMs = CLAIM_CONFIG.cooldownSeconds * 1000
      const msSinceLastClaim = Date.now() - lastClaimMs
      const msRemaining = cooldownMs - msSinceLastClaim

      if (msRemaining > 0) {
        const secondsRemaining = Math.ceil(msRemaining / 1000)
        log.warn("Cooldown not elapsed — claim rejected server-side", {
          userId: user.id,
          secondsRemaining,
          lastClaimAt: profile.last_claim_at,
        })
        return NextResponse.json(
          {
            error: `Cooldown active. Please wait ${secondsRemaining} more seconds.`,
            cooldownRemaining: secondsRemaining,
            code: "COOLDOWN_ACTIVE",
          },
          { status: 429 },
        )
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const newStreak = calculateStreak(profile.last_claim_at, profile.claim_streak)

    // Calculate claim amount
    const { base, streakBonus, total } = calculateClaimAmount(newStreak)

    const fingerprint = validatedData.success ? validatedData.data.fingerprint : undefined
    const userAgent = headersList.get("user-agent") || null
    const idempotencyKey = `claim:${user.id}:${Date.now()}`

    const { data: atomicResult, error: atomicError } = await supabase.rpc("atomic_claim", {
      p_user_id: user.id,
      p_ip_address: ipAddress,
      p_device_fingerprint: fingerprint?.visitorId || null,
      p_user_agent: userAgent,
      p_base_amount: base,
      p_streak_bonus: streakBonus,
      p_referral_bonus: 0,
      p_fraud_score: Math.min(claimFraudScore, 100),
      p_idempotency_key: idempotencyKey,
    })

    // If atomic function exists and works
    if (!atomicError && atomicResult?.success) {
      log.info("Claim processed atomically", {
        userId: user.id,
        amount: atomicResult.amount,
        streak: atomicResult.streak_day,
        duration: Date.now() - startTime,
      })

      // Process referral commission async
      if (profile.referred_by) {
        const commission = Math.floor(total * (CLAIM_CONFIG.referralBonusPercentage / 100))
        if (commission > 0) {
          supabase
            .rpc("process_referral_commission", {
              p_claim_id: atomicResult.claim_id,
              p_referrer_id: profile.referred_by,
              p_claim_amount: total,
              p_commission_rate: CLAIM_CONFIG.referralBonusPercentage / 100,
            })
            .then(() => { })
            .catch((err) => log.error("Referral commission failed", { error: err }))
        }
      }

      return NextResponse.json({
        success: true,
        amount: atomicResult.amount,
        streak: atomicResult.streak_day,
        balance: atomicResult.new_balance,
        nextClaimAt: atomicResult.next_claim_at,
      })
    }

    // Fallback to non-atomic claim (if function doesn't exist)
    const { data: claim, error: claimError } = await supabase
      .from("claims")
      .insert({
        user_id: user.id,
        amount_satoshis: total,
        base_amount_satoshis: base,
        streak_bonus_satoshis: streakBonus,
        referral_bonus_satoshis: 0,
        streak_day: newStreak,
        ip_address: ipAddress,
        user_agent: userAgent,
        device_fingerprint: fingerprint?.visitorId || null,
        fraud_score: Math.min(claimFraudScore, 100),
        is_flagged: claimFraudScore > 70,
      })
      .select()
      .single()

    if (claimError) {
      log.error("Claim insert error", { error: claimError, userId: user.id })
      return NextResponse.json({ error: "Failed to process claim" }, { status: 500 })
    }

    // Update user profile
    const newBalance = Number(profile.balance_satoshis) + total
    const newTotalEarned = Number(profile.total_earned_satoshis) + total
    const newTotalClaims = profile.total_claims + 1
    const newMaxStreak = Math.max(profile.max_claim_streak, newStreak)

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        balance_satoshis: newBalance,
        total_earned_satoshis: newTotalEarned,
        total_claims: newTotalClaims,
        claim_streak: newStreak,
        max_claim_streak: newMaxStreak,
        last_claim_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        fraud_score: Math.min(claimFraudScore, 100),
      })
      .eq("id", user.id)

    if (updateError) {
      log.error("Profile update error", { error: updateError, userId: user.id })
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
    }

    // Create transaction
    await supabase.from("transactions").insert({
      user_id: user.id,
      type: "claim",
      status: "completed",
      amount_satoshis: total,
      balance_before: profile.balance_satoshis,
      balance_after: newBalance,
      claim_id: claim.id,
      idempotency_key: idempotencyKey,
      description: `Claim reward (Day ${newStreak} streak)`,
      completed_at: new Date().toISOString(),
    })

    // Process referral commission
    if (profile.referred_by) {
      const commission = Math.floor(total * (CLAIM_CONFIG.referralBonusPercentage / 100))
      if (commission > 0) {
        const { data: referrer } = await supabase
          .from("profiles")
          .select("balance_satoshis, referral_earnings_satoshis")
          .eq("id", profile.referred_by)
          .single()

        if (referrer) {
          const referrerNewBalance = Number(referrer.balance_satoshis) + commission
          await supabase
            .from("profiles")
            .update({
              balance_satoshis: referrerNewBalance,
              referral_earnings_satoshis: Number(referrer.referral_earnings_satoshis) + commission,
            })
            .eq("id", profile.referred_by)

          await supabase.from("transactions").insert({
            user_id: profile.referred_by,
            type: "referral_bonus",
            status: "completed",
            amount_satoshis: commission,
            balance_before: referrer.balance_satoshis,
            balance_after: referrerNewBalance,
            referral_id: user.id,
            description: `Referral bonus`,
            metadata: { from_user_id: user.id, claim_id: claim.id },
            completed_at: new Date().toISOString(),
          })
        }
      }
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: profile.role,
      actor_ip: ipAddress,
      action: "claim",
      resource_type: "claim",
      resource_id: claim.id,
      metadata: { amount: total, streak: newStreak, fraud_score: claimFraudScore },
    })

    log.info("Claim processed", {
      userId: user.id,
      amount: total,
      streak: newStreak,
      duration: Date.now() - startTime,
    })

    return NextResponse.json({
      success: true,
      amount: total,
      streak: newStreak,
      balance: newBalance,
      nextClaimAt: new Date(Date.now() + CLAIM_CONFIG.cooldownSeconds * 1000).toISOString(),
    })
  } catch (error) {
    log.error("Claim error", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
