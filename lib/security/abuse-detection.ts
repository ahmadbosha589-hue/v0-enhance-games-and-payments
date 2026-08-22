// =============================================================================
// ABUSE DETECTION SYSTEM v2.0 - Comprehensive Fraud Prevention
// =============================================================================
//
// Real-time abuse detection with:
// 1. Pattern recognition for scripted behavior
// 2. Velocity checks for burst activity
// 3. Cross-account correlation
// 4. Geographic impossibility detection
// 5. Session hijacking detection
// 6. Reward manipulation detection
// 7. Multi-account farming detection
// 8. Automated response system
//
// =============================================================================

import { createAdminClient } from "@/lib/supabase/server"
import { log } from "@/lib/logger"

// =============================================================================
// TYPES
// =============================================================================

export interface AbuseDetectionResult {
  isAbuse: boolean
  confidence: number // 0-100
  abuseType: AbuseType[]
  riskScore: number
  shouldBlock: boolean
  shouldBan: boolean
  shouldFlagForReview: boolean
  reasons: string[]
  evidence: AbuseEvidence[]
  recommendedAction: "allow" | "warn" | "block" | "flag" | "ban"
}

export type AbuseType =
  | "scripted_behavior"
  | "burst_activity"
  | "multi_account"
  | "geographic_impossibility"
  | "session_hijacking"
  | "reward_manipulation"
  | "referral_abuse"
  | "bot_activity"
  | "vpn_abuse"
  | "coupon_abuse"
  | "withdrawal_fraud"

export interface AbuseEvidence {
  type: string
  description: string
  confidence: number
  timestamp: number
  data?: Record<string, unknown>
}

export interface AbuseContext {
  userId: string
  ip: string
  fingerprint?: string
  userAgent?: string
  action: string
  metadata?: Record<string, unknown>
}

// =============================================================================
// DETECTION THRESHOLDS
// =============================================================================

const THRESHOLDS = {
  // Velocity thresholds (actions per time window)
  claims_per_minute: 3,
  claims_per_hour: 60,
  ptc_views_per_minute: 10,
  shortlinks_per_minute: 5,
  games_per_minute: 2,
  coupons_per_hour: 5,
  
  // Pattern thresholds
  min_action_interval_ms: 500, // Minimum time between actions
  max_consistent_timing_ratio: 0.1, // Max coefficient of variation for "robotic" timing
  
  // Geographic thresholds
  max_country_changes_per_day: 3,
  impossible_travel_speed_kmh: 1000, // Faster than commercial aircraft
  
  // Multi-account thresholds
  max_accounts_per_ip_per_day: 3,
  max_accounts_per_fingerprint: 2,
  max_accounts_per_subnet: 10,
  
  // Session thresholds
  session_overlap_threshold: 3, // Max concurrent sessions
  session_hop_threshold: 5, // Max IP changes per session
  
  // Fraud score thresholds
  warn_threshold: 30,
  block_threshold: 60,
  ban_threshold: 85,
}

// =============================================================================
// CORE DETECTION FUNCTIONS
// =============================================================================

export async function detectAbuse(context: AbuseContext): Promise<AbuseDetectionResult> {
  const evidence: AbuseEvidence[] = []
  const abuseTypes: AbuseType[] = []
  let totalScore = 0
  const reasons: string[] = []
  
  const adminSupabase = createAdminClient()
  if (!adminSupabase) {
    return createSafeResult()
  }
  
  const now = Date.now()
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 1: Velocity Analysis (burst detection)
  // ═══════════════════════════════════════════════════════════════════════════
  const velocityResult = await checkVelocity(context, adminSupabase, now)
  if (velocityResult.score > 0) {
    totalScore += velocityResult.score
    evidence.push(...velocityResult.evidence)
    reasons.push(...velocityResult.reasons)
    if (velocityResult.score >= 30) {
      abuseTypes.push("burst_activity")
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 2: Scripted Behavior Detection
  // ═══════════════════════════════════════════════════════════════════════════
  const scriptedResult = await checkScriptedBehavior(context, adminSupabase, now)
  if (scriptedResult.score > 0) {
    totalScore += scriptedResult.score
    evidence.push(...scriptedResult.evidence)
    reasons.push(...scriptedResult.reasons)
    if (scriptedResult.score >= 40) {
      abuseTypes.push("scripted_behavior")
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 3: Multi-Account Detection
  // ═══════════════════════════════════════════════════════════════════════════
  const multiAccountResult = await checkMultiAccount(context, adminSupabase, now)
  if (multiAccountResult.score > 0) {
    totalScore += multiAccountResult.score
    evidence.push(...multiAccountResult.evidence)
    reasons.push(...multiAccountResult.reasons)
    if (multiAccountResult.score >= 30) {
      abuseTypes.push("multi_account")
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 4: Geographic Impossibility
  // ═══════════════════════════════════════════════════════════════════════════
  const geoResult = await checkGeographicImpossibility(context, adminSupabase, now)
  if (geoResult.score > 0) {
    totalScore += geoResult.score
    evidence.push(...geoResult.evidence)
    reasons.push(...geoResult.reasons)
    if (geoResult.score >= 40) {
      abuseTypes.push("geographic_impossibility")
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 5: Session Anomalies
  // ═══════════════════════════════════════════════════════════════════════════
  const sessionResult = await checkSessionAnomalies(context, adminSupabase, now)
  if (sessionResult.score > 0) {
    totalScore += sessionResult.score
    evidence.push(...sessionResult.evidence)
    reasons.push(...sessionResult.reasons)
    if (sessionResult.score >= 35) {
      abuseTypes.push("session_hijacking")
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 6: Reward Manipulation
  // ═══════════════════════════════════════════════════════════════════════════
  const rewardResult = await checkRewardManipulation(context, adminSupabase, now)
  if (rewardResult.score > 0) {
    totalScore += rewardResult.score
    evidence.push(...rewardResult.evidence)
    reasons.push(...rewardResult.reasons)
    if (rewardResult.score >= 50) {
      abuseTypes.push("reward_manipulation")
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK 7: Historical Fraud Flags
  // ═══════════════════════════════════════════════════════════════════════════
  const historyResult = await checkFraudHistory(context, adminSupabase)
  if (historyResult.score > 0) {
    totalScore += historyResult.score
    evidence.push(...historyResult.evidence)
    reasons.push(...historyResult.reasons)
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DETERMINE FINAL RESULT
  // ═══════════════════════════════════════════════════════════════════════════
  
  const confidence = Math.min(100, totalScore)
  const isAbuse = totalScore >= THRESHOLDS.warn_threshold
  const shouldBlock = totalScore >= THRESHOLDS.block_threshold
  const shouldBan = totalScore >= THRESHOLDS.ban_threshold
  const shouldFlagForReview = totalScore >= THRESHOLDS.warn_threshold && totalScore < THRESHOLDS.block_threshold
  
  let recommendedAction: "allow" | "warn" | "block" | "flag" | "ban" = "allow"
  if (shouldBan) {
    recommendedAction = "ban"
  } else if (shouldBlock) {
    recommendedAction = "block"
  } else if (shouldFlagForReview) {
    recommendedAction = "flag"
  } else if (isAbuse) {
    recommendedAction = "warn"
  }
  
  // Log abuse detection
  if (isAbuse) {
    log.warn("Abuse detected", {
      userId: context.userId,
      action: context.action,
      score: totalScore,
      types: abuseTypes,
      recommendation: recommendedAction,
    })
    
    // Record in database
    await recordAbuseDetection(context, {
      isAbuse,
      confidence,
      abuseType: abuseTypes,
      riskScore: totalScore,
      shouldBlock,
      shouldBan,
      shouldFlagForReview,
      reasons,
      evidence,
      recommendedAction,
    }, adminSupabase)
  }
  
  return {
    isAbuse,
    confidence,
    abuseType: abuseTypes,
    riskScore: totalScore,
    shouldBlock,
    shouldBan,
    shouldFlagForReview,
    reasons,
    evidence,
    recommendedAction,
  }
}

// =============================================================================
// INDIVIDUAL CHECK FUNCTIONS
// =============================================================================

async function checkVelocity(
  context: AbuseContext,
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  now: number
): Promise<{ score: number; evidence: AbuseEvidence[]; reasons: string[] }> {
  const evidence: AbuseEvidence[] = []
  const reasons: string[] = []
  let score = 0
  
  const oneMinuteAgo = new Date(now - 60 * 1000).toISOString()
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()
  
  // Check claims velocity
  const { count: claimsMinute } = await supabase
    .from("claims")
    .select("*", { count: "exact", head: true })
    .eq("user_id", context.userId)
    .gte("created_at", oneMinuteAgo)
  
  if (claimsMinute && claimsMinute > THRESHOLDS.claims_per_minute) {
    score += 40
    evidence.push({
      type: "velocity",
      description: `${claimsMinute} claims in last minute (threshold: ${THRESHOLDS.claims_per_minute})`,
      confidence: 90,
      timestamp: now,
    })
    reasons.push(`Excessive claim velocity: ${claimsMinute}/min`)
  }
  
  const { count: claimsHour } = await supabase
    .from("claims")
    .select("*", { count: "exact", head: true })
    .eq("user_id", context.userId)
    .gte("created_at", oneHourAgo)
  
  if (claimsHour && claimsHour > THRESHOLDS.claims_per_hour) {
    score += 30
    evidence.push({
      type: "velocity",
      description: `${claimsHour} claims in last hour (threshold: ${THRESHOLDS.claims_per_hour})`,
      confidence: 85,
      timestamp: now,
    })
    reasons.push(`Excessive hourly claims: ${claimsHour}/hr`)
  }
  
  // Check PTC velocity
  const { count: ptcMinute } = await supabase
    .from("ptc_views")
    .select("*", { count: "exact", head: true })
    .eq("user_id", context.userId)
    .gte("created_at", oneMinuteAgo)
  
  if (ptcMinute && ptcMinute > THRESHOLDS.ptc_views_per_minute) {
    score += 35
    evidence.push({
      type: "velocity",
      description: `${ptcMinute} PTC views in last minute`,
      confidence: 88,
      timestamp: now,
    })
    reasons.push(`Excessive PTC velocity: ${ptcMinute}/min`)
  }
  
  return { score, evidence, reasons }
}

async function checkScriptedBehavior(
  context: AbuseContext,
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  now: number
): Promise<{ score: number; evidence: AbuseEvidence[]; reasons: string[] }> {
  const evidence: AbuseEvidence[] = []
  const reasons: string[] = []
  let score = 0
  
  // Get recent actions with timestamps
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()
  
  const { data: recentClaims } = await supabase
    .from("claims")
    .select("created_at")
    .eq("user_id", context.userId)
    .gte("created_at", oneHourAgo)
    .order("created_at", { ascending: true })
  
  if (recentClaims && recentClaims.length >= 10) {
    const timestamps = recentClaims.map(c => new Date(c.created_at).getTime())
    const intervals: number[] = []
    
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1])
    }
    
    // Check for impossibly fast actions
    const fastActions = intervals.filter(i => i < THRESHOLDS.min_action_interval_ms)
    if (fastActions.length > 0) {
      score += 50
      evidence.push({
        type: "scripted",
        description: `${fastActions.length} actions faster than ${THRESHOLDS.min_action_interval_ms}ms`,
        confidence: 95,
        timestamp: now,
      })
      reasons.push("Impossibly fast action timing detected")
    }
    
    // Check for robotic consistency
    if (intervals.length >= 5) {
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / intervals.length
      const stdDev = Math.sqrt(variance)
      const coeffOfVar = stdDev / avg
      
      if (coeffOfVar < THRESHOLDS.max_consistent_timing_ratio) {
        score += 45
        evidence.push({
          type: "scripted",
          description: `Timing coefficient of variation: ${coeffOfVar.toFixed(4)} (threshold: ${THRESHOLDS.max_consistent_timing_ratio})`,
          confidence: 92,
          timestamp: now,
        })
        reasons.push("Robotic timing pattern detected")
      }
    }
  }
  
  return { score, evidence, reasons }
}

async function checkMultiAccount(
  context: AbuseContext,
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  now: number
): Promise<{ score: number; evidence: AbuseEvidence[]; reasons: string[] }> {
  const evidence: AbuseEvidence[] = []
  const reasons: string[] = []
  let score = 0
  
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  
  // Check accounts per IP today
  const { data: ipAccounts } = await supabase
    .from("profiles")
    .select("id")
    .eq("signup_ip", context.ip)
    .gte("created_at", oneDayAgo)
  
  if (ipAccounts && ipAccounts.length > THRESHOLDS.max_accounts_per_ip_per_day) {
    score += 40
    evidence.push({
      type: "multi_account",
      description: `${ipAccounts.length} accounts created from same IP today`,
      confidence: 88,
      timestamp: now,
    })
    reasons.push(`Multiple accounts from same IP: ${ipAccounts.length}`)
  }
  
  // Check accounts per fingerprint
  if (context.fingerprint) {
    const { count: fpAccounts } = await supabase
      .from("device_fingerprints")
      .select("*", { count: "exact", head: true })
      .eq("fingerprint_hash", context.fingerprint)
    
    if (fpAccounts && fpAccounts > THRESHOLDS.max_accounts_per_fingerprint) {
      score += 50
      evidence.push({
        type: "multi_account",
        description: `${fpAccounts} accounts linked to same device fingerprint`,
        confidence: 92,
        timestamp: now,
      })
      reasons.push(`Same device used for ${fpAccounts} accounts`)
    }
  }
  
  return { score, evidence, reasons }
}

async function checkGeographicImpossibility(
  context: AbuseContext,
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  now: number
): Promise<{ score: number; evidence: AbuseEvidence[]; reasons: string[] }> {
  const evidence: AbuseEvidence[] = []
  const reasons: string[] = []
  let score = 0
  
  // Get recent login locations
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()
  
  const { data: recentLogins } = await supabase
    .from("login_history")
    .select("ip_address, country, city, created_at")
    .eq("user_id", context.userId)
    .gte("created_at", oneHourAgo)
    .order("created_at", { ascending: true })
  
  if (recentLogins && recentLogins.length >= 2) {
    const countries = new Set(recentLogins.map(l => l.country).filter(Boolean))
    
    if (countries.size > THRESHOLDS.max_country_changes_per_day) {
      score += 60
      evidence.push({
        type: "geographic",
        description: `User logged in from ${countries.size} different countries in 1 hour`,
        confidence: 95,
        timestamp: now,
        data: { countries: Array.from(countries) },
      })
      reasons.push(`Impossible geographic activity: ${countries.size} countries in 1 hour`)
    }
  }
  
  return { score, evidence, reasons }
}

async function checkSessionAnomalies(
  context: AbuseContext,
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  now: number
): Promise<{ score: number; evidence: AbuseEvidence[]; reasons: string[] }> {
  const evidence: AbuseEvidence[] = []
  const reasons: string[] = []
  let score = 0
  
  // Check for concurrent sessions
  const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString()
  
  const { data: recentActivity } = await supabase
    .from("user_activity")
    .select("ip_address, fingerprint")
    .eq("user_id", context.userId)
    .gte("created_at", fiveMinutesAgo)
  
  if (recentActivity && recentActivity.length > 0) {
    const uniqueIPs = new Set(recentActivity.map(a => a.ip_address))
    const uniqueFPs = new Set(recentActivity.map(a => a.fingerprint).filter(Boolean))
    
    if (uniqueIPs.size > THRESHOLDS.session_hop_threshold) {
      score += 45
      evidence.push({
        type: "session",
        description: `${uniqueIPs.size} different IPs in 5 minutes`,
        confidence: 90,
        timestamp: now,
      })
      reasons.push(`Session hopping: ${uniqueIPs.size} IPs`)
    }
    
    if (uniqueFPs.size > THRESHOLDS.session_overlap_threshold) {
      score += 40
      evidence.push({
        type: "session",
        description: `${uniqueFPs.size} different device fingerprints active`,
        confidence: 88,
        timestamp: now,
      })
      reasons.push(`Multiple devices active: ${uniqueFPs.size}`)
    }
  }
  
  return { score, evidence, reasons }
}

async function checkRewardManipulation(
  context: AbuseContext,
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  now: number
): Promise<{ score: number; evidence: AbuseEvidence[]; reasons: string[] }> {
  const evidence: AbuseEvidence[] = []
  const reasons: string[] = []
  let score = 0
  
  // Check for suspicious claim patterns
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  
  const { data: claims } = await supabase
    .from("claims")
    .select("amount_satoshis, crypto, created_at")
    .eq("user_id", context.userId)
    .gte("created_at", oneDayAgo)
  
  if (claims && claims.length > 0) {
    // Check for always-max rewards (statistically improbable)
    const { data: faucetSettings } = await supabase
      .from("faucet_settings")
      .select("max_reward")
    
    if (faucetSettings && faucetSettings.length > 0) {
      const maxRewards = faucetSettings.map(s => s.max_reward)
      const maxClaimsCount = claims.filter(c => maxRewards.includes(c.amount_satoshis)).length
      
      if (maxClaimsCount / claims.length > 0.9 && claims.length >= 10) {
        score += 50
        evidence.push({
          type: "reward",
          description: `${maxClaimsCount}/${claims.length} claims at maximum reward (statistically improbable)`,
          confidence: 88,
          timestamp: now,
        })
        reasons.push("Suspiciously high reward rate")
      }
    }
  }
  
  return { score, evidence, reasons }
}

async function checkFraudHistory(
  context: AbuseContext,
  supabase: NonNullable<ReturnType<typeof createAdminClient>>
): Promise<{ score: number; evidence: AbuseEvidence[]; reasons: string[] }> {
  const evidence: AbuseEvidence[] = []
  const reasons: string[] = []
  let score = 0
  
  // Check existing fraud flags
  const { data: profile } = await supabase
    .from("profiles")
    .select("fraud_score, is_banned, fraud_flags")
    .eq("id", context.userId)
    .single()
  
  if (profile) {
    if (profile.fraud_score && profile.fraud_score > 0) {
      score += Math.min(profile.fraud_score, 40)
      evidence.push({
        type: "history",
        description: `Existing fraud score: ${profile.fraud_score}`,
        confidence: 100,
        timestamp: Date.now(),
      })
      reasons.push(`Previous fraud score: ${profile.fraud_score}`)
    }
    
    if (profile.is_banned) {
      score += 100 // Banned users should always be blocked
      evidence.push({
        type: "history",
        description: "User is banned",
        confidence: 100,
        timestamp: Date.now(),
      })
      reasons.push("User is banned")
    }
  }
  
  return { score, evidence, reasons }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createSafeResult(): AbuseDetectionResult {
  return {
    isAbuse: false,
    confidence: 0,
    abuseType: [],
    riskScore: 0,
    shouldBlock: false,
    shouldBan: false,
    shouldFlagForReview: false,
    reasons: [],
    evidence: [],
    recommendedAction: "allow",
  }
}

async function recordAbuseDetection(
  context: AbuseContext,
  result: AbuseDetectionResult,
  supabase: NonNullable<ReturnType<typeof createAdminClient>>
): Promise<void> {
  try {
    await supabase.from("fraud_flags").insert({
      user_id: context.userId,
      fraud_type: result.abuseType[0] || "unknown",
      severity: result.shouldBan ? 10 : result.shouldBlock ? 8 : 6,
      evidence: {
        action: context.action,
        ip: context.ip,
        fingerprint: context.fingerprint,
        score: result.riskScore,
        types: result.abuseType,
        reasons: result.reasons,
        evidence_data: result.evidence,
        recommendation: result.recommendedAction,
      },
      status: "pending_review",
    })
    
    // Update user fraud score
    if (result.riskScore > 0) {
      await supabase.rpc("increment_fraud_score", {
        p_user_id: context.userId,
        p_amount: Math.ceil(result.riskScore / 10),
      }).then(undefined, () => {
        // Fallback
        supabase
          .from("profiles")
          .update({
            fraud_score: Math.min(100, result.riskScore),
          })
          .eq("id", context.userId)
      })
    }
    
    // Auto-ban if score is high enough
    if (result.shouldBan) {
      await supabase
        .from("profiles")
        .update({
          is_banned: true,
          banned_at: new Date().toISOString(),
          ban_reason: result.reasons.join("; "),
          status: "banned",
        })
        .eq("id", context.userId)
    }
  } catch (error) {
    log.error("Failed to record abuse detection", { error, context })
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { THRESHOLDS }
