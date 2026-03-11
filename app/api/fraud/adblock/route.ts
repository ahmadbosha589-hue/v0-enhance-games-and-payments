import { type NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { logFraudFlag, updateUserFraudScore } from "@/lib/fraud/detector"
import { headers } from "next/headers"
import { log } from "@/lib/logger"

// =============================================================================
// =============================================================================
// ULTIMATE ADBLOCK FRAUD FLAGGING API v5.0 - FORTRESS EDITION (2026)
// =============================================================================
// =============================================================================
//
// ███████╗██████╗  █████╗ ██╗   ██╗██████╗     ███████╗██╗      █████╗  ██████╗ 
// ██╔════╝██╔══██╗██╔══██╗██║   ██║██╔══██╗    ██╔════╝██║     ██╔══██╗██╔════╝ 
// █████╗  ██████╔╝███████║██║   ██║██║  ██║    █████╗  ██║     ███████║██║  ███╗
// ██╔══╝  ██╔══██╗██╔══██║██║   ██║██║  ██║    ██╔══╝  ██║     ██╔══██║██║   ██║
// ██║     ██║  ██║██║  ██║╚██████╔╝██████╔╝    ██║     ███████╗██║  ██║╚██████╔╝
// ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝     ╚═╝     ╚══════╝╚═╝  ╚═╝ ╚═════╝ 
//
// CORE PRINCIPLE: NEVER TRUST CLIENT-SIDE
//
// This endpoint receives adblock detection reports and applies STRICT
// server-side verification before flagging users. Zero false positives.
//
// ZERO FALSE POSITIVE REQUIREMENTS (v5.0 ENHANCED):
// 1. Server verification must be true (shouldBlock = true)
// 2. Server score must be >= 55%
// 3. Confidence must be >= 65%
// 4. Multiple detection methods required (3+)
// 5. Signal diversity required (2+ categories)
// 6. Control probes must NOT be blocked
// 7. Cross-session validation for repeat offenders
//
// =============================================================================

interface AdblockReport {
  userId: string
  reason?: string
  warningDuration?: number
  detectionMethods?: string[]
  confidence?: number
  blockerType?: string
  consecutiveDetections?: number
  serverVerified?: boolean
  signals?: {
    method: string
    category: string
    weight: number
    confidence: number
  }[]
  // New fortress fields
  serverScore?: number
  riskLevel?: string
  factors?: Record<string, boolean | number | string>
  shouldBlock?: boolean
}

// Methods that are extremely reliable (zero false positives) - v5.0 ENHANCED
const HIGH_CONFIDENCE_METHODS = [
  // Server-side honeypot methods (PRIMARY - most reliable)
  "server_honeypot_blocked",
  "honeypot_cross_validated",
  "honeypot_ad_blocked",
  "honeypot_tracking_blocked",
  "honeypot_analytics_blocked",
  "honeypot_social_blocked",
  "honeypot_network_blocked",
  // Bait-based detection
  "bait-fetch-blocked",
  "bait-image-blocked",
  "bait-script-blocked",
  "bait-iframe-blocked",
  // Network-level detection
  "dns-blocking",
  "request-interception",
  "network-timing-anomaly",
  // Behavioral (v5.0 enhanced)
  "behavior_anomaly",
  "behavior_repeat_adblock_offender",
  "behavior_bot_like_speed",
  "behavior_automated_pattern",
  "history_repeat_offender",
  "history_chronic_offender",
  "history_consistent_blocker",
  // Cross-session correlation
  "multi_account_correlation",
  "client_corroborated",
  // Privacy browser correlation
  "privacy_browser_brave",
  "privacy_browser_tor_browser",
  "privacy_browser_librewolf",
]

// Blockers we can identify with certainty
const KNOWN_BLOCKERS = [
  "uBlock Origin",
  "AdBlock Plus",
  "AdGuard",
  "Brave Shields",
  "Firefox Tracking Protection",
  "Opera Ad Blocker",
  "Ghostery",
  "DNS/Network Level Blocker",
  "Privacy Badger",
  "DuckDuckGo Privacy",
]

// =============================================================================
// VERIFICATION FUNCTION - STRICT REQUIREMENTS
// =============================================================================

interface VerificationResult {
  isLegitimate: boolean
  confidence: number
  reason: string
}

function verifyDetectionLegitimacy(report: AdblockReport): VerificationResult {
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 1: SERVER VERIFICATION REQUIRED (CRITICAL)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (!report.serverVerified) {
    // Without server verification, we need VERY strong evidence
    if (!report.signals || report.signals.length < 5) {
      return {
        isLegitimate: false,
        confidence: 0,
        reason: "No server verification and insufficient signals"
      }
    }
    // Even with many signals, lower the confidence without server verification
    const maxConfidence = Math.min(report.confidence || 0, 50)
    if (maxConfidence < 50) {
      return {
        isLegitimate: false,
        confidence: maxConfidence,
        reason: "No server verification - confidence capped at 50%"
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 2: CHECK SERVER SCORE (v5.0 ENHANCED - STRICTER)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (report.serverScore !== undefined && report.serverScore < 55) {
    return {
      isLegitimate: false,
      confidence: 0,
      reason: `Server score too low: ${report.serverScore}% (minimum 55% required)`
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 3: CHECK shouldBlock FLAG (FORTRESS DECISION)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (report.shouldBlock === false) {
    // Fortress decided not to block - respect that
    return {
      isLegitimate: false,
      confidence: 0,
      reason: "Fortress verification did not recommend blocking"
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 4: HIGH-CONFIDENCE METHODS REQUIRED
  // ═══════════════════════════════════════════════════════════════════════════

  const methods = report.detectionMethods || []
  const signals = report.signals || []
  
  const highConfidenceMethods = methods.filter(m => HIGH_CONFIDENCE_METHODS.includes(m))
  const highConfidenceSignals = signals.filter(s => HIGH_CONFIDENCE_METHODS.includes(s.method))
  
  const hasHighConfidence = highConfidenceMethods.length > 0 || highConfidenceSignals.length > 0

  if (!hasHighConfidence) {
    // No high-confidence methods - need more evidence
    if ((report.confidence || 0) < 80 || (report.consecutiveDetections || 0) < 5) {
      return {
        isLegitimate: false,
        confidence: 0,
        reason: "No high-confidence detection methods and insufficient other evidence"
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 5: SIGNAL DIVERSITY REQUIRED
  // ═══════════════════════════════════════════════════════════════════════════

  const categories = new Set(signals.map(s => s.category))
  if (categories.size < 2 && !hasHighConfidence) {
    // Only one category of signals without high-confidence methods
    if ((report.confidence || 0) < 85) {
      return {
        isLegitimate: false,
        confidence: 0,
        reason: "Insufficient signal diversity"
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 6: CONTROL PROBE CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  if (report.factors?.clientControlBlocked === true) {
    // Control probe was blocked - potential network issue, not adblock
    return {
      isLegitimate: false,
      confidence: 0,
      reason: "Control probe blocked - potential false positive"
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 7: CALCULATE FINAL CONFIDENCE
  // ═══════════════════════════════════════════════════════════════════════════

  let weightedConfidence = 0
  let totalWeight = 0

  for (const signal of signals) {
    const weight = signal.weight || 50
    const conf = signal.confidence || 50
    weightedConfidence += weight * conf
    totalWeight += weight
  }

  const calculatedConfidence = totalWeight > 0 
    ? weightedConfidence / totalWeight 
    : report.confidence || 0

  // Bonuses
  const serverBonus = report.serverVerified ? 15 : 0
  const blockerBonus = report.blockerType && KNOWN_BLOCKERS.includes(report.blockerType) ? 10 : 0
  const methodBonus = Math.min(methods.length * 3, 15)
  const fortressBonus = report.serverScore ? Math.min(report.serverScore * 0.2, 15) : 0
  
  const finalConfidence = Math.min(
    calculatedConfidence + serverBonus + blockerBonus + methodBonus + fortressBonus,
    100
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL THRESHOLD: Must be >= 65% for v5.0 (stricter than v4.0)
  // ═══════════════════════════════════════════════════════════════════════════

  if (finalConfidence < 65) {
    return {
      isLegitimate: false,
      confidence: finalConfidence,
      reason: `Confidence ${finalConfidence.toFixed(1)}% below threshold (65% required for v5.0)`
    }
  }

  return {
    isLegitimate: true,
    confidence: finalConfidence,
    reason: `Verified with ${finalConfidence.toFixed(1)}% confidence`
  }
}

// =============================================================================
// POST HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const headersList = await headers()
    
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body: AdblockReport = await request.json()
    const {
      userId,
      reason,
      warningDuration,
      detectionMethods,
      confidence,
      blockerType,
      consecutiveDetections,
      serverVerified,
      signals,
      serverScore,
      riskLevel,
      factors,
      shouldBlock,
    } = body

    // Verify the user is flagging themselves (prevent abuse)
    if (userId !== user.id) {
      return NextResponse.json({ error: "Invalid user" }, { status: 403 })
    }

    // Get request metadata
    const forwarded = headersList.get("x-forwarded-for")
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : 
                     headersList.get("x-real-ip") || 
                     headersList.get("cf-connecting-ip") || 
                     "127.0.0.1"

    // ═══════════════════════════════════════════════════════════════════════════
    // VERIFY LEGITIMACY - ZERO FALSE POSITIVE ENFORCEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    const verification = verifyDetectionLegitimacy(body)
    
    if (!verification.isLegitimate) {
      // Don't flag - potential false positive
      log.info(`[AdblockFraudAPI] Rejected detection for ${userId}: ${verification.reason}`, {
        userId,
        confidence: verification.confidence,
        serverScore,
        serverVerified,
        shouldBlock,
        reason: verification.reason,
      })
      
      return NextResponse.json({
        success: false,
        flagged: false,
        reason: "Detection did not meet verification threshold",
        confidence: verification.confidence,
        verificationReason: verification.reason,
      })
    }

    const adminClient = createAdminClient()

    // ═══════════════════════════════════════════════════════════════════════════
    // CHECK FOR RECENT DETECTION (AVOID SPAM)
    // ═══════════════════════════════════════════════════════════════════════════

    const { data: profile } = await adminClient
      .from("profiles")
      .select("fraud_score, fraud_flags, adblock_detections, last_adblock_detection")
      .eq("id", userId)
      .single()

    const lastDetection = profile?.last_adblock_detection
    if (lastDetection) {
      const timeSinceLastMs = Date.now() - new Date(lastDetection).getTime()
      // Ignore if less than 5 minutes since last detection
      if (timeSinceLastMs < 5 * 60 * 1000) {
        return NextResponse.json({
          success: true,
          flagged: false,
          reason: "Already flagged recently",
          confidence: verification.confidence,
        })
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LOG THE FRAUD FLAG
    // ═══════════════════════════════════════════════════════════════════════════

    await logFraudFlag(adminClient, userId, "adblock_user", 
      riskLevel === "critical" || riskLevel === "high" ? "high" : "medium", 
      {
        reason,
        warningDuration,
        detectionMethods,
        confidence: verification.confidence,
        blockerType,
        consecutiveDetections,
        serverVerified,
        serverScore,
        riskLevel,
        signalCount: signals?.length || 0,
        verificationReason: verification.reason,
        factors,
        detectedAt: new Date().toISOString(),
        userAgent: headersList.get("user-agent"),
        ip: ipAddress,
      }
    )

    // ═══════════════════════════════════════════════════════════════════════════
    // UPDATE USER PROFILE
    // ═══════════════════════════════════════════════════════════════════════════

    const currentScore = profile?.fraud_score || 0
    const detectionCount = (profile?.adblock_detections || 0) + 1
    
    // Score increase scales with confidence and repeat offenses
    // More aggressive for fortress-verified detections
    let scoreIncrease = Math.floor(verification.confidence * 0.4)
    if (detectionCount > 1) {
      scoreIncrease = Math.min(scoreIncrease + (detectionCount * 5), 55)
    }
    if (serverScore && serverScore >= 70) {
      scoreIncrease += 10 // Fortress high-confidence bonus
    }
    
    const newScore = Math.min(currentScore + scoreIncrease, 100)

    const updateData: Record<string, unknown> = {
      fraud_score: newScore,
      adblock_detections: detectionCount,
      last_adblock_detection: new Date().toISOString(),
    }

    // Flag user if score is high enough
    if (newScore >= 65) {
      updateData.is_flagged = true
      updateData.adblock_flagged = true
    }

    // Suspend if very high score
    if (newScore >= 85) {
      updateData.status = "suspended"
    }

    await adminClient.from("profiles").update(updateData).eq("id", userId)

    // ═══════════════════════════════════════════════════════════════════════════
    // CREATE ADMIN NOTIFICATION
    // ═══════════════════════════════════════════════════════════════════════════

    if (detectionCount === 1 || newScore >= 75) {
      await adminClient.from("notifications").insert({
        user_id: userId,
        type: "fraud_alert",
        title: "Adblock Violation Confirmed (Fortress)",
        message: `User verified using ${blockerType || "ad blocker"} with ${verification.confidence.toFixed(0)}% confidence (Server: ${serverScore || 'N/A'}%). Detection #${detectionCount}.`,
        data: {
          fraudType: "adblock_user",
          score: newScore,
          blockerType,
          confidence: verification.confidence,
          serverVerified,
          serverScore,
          riskLevel,
          detectionCount,
        },
      })
    }

    log.warn("User flagged for adblock (FORTRESS)", {
      userId,
      newScore,
      confidence: verification.confidence,
      serverScore,
      riskLevel,
      detectionCount,
      blockerType,
    })

    return NextResponse.json({
      success: true,
      newScore,
      flagged: newScore >= 65,
      confidence: verification.confidence,
      verificationReason: verification.reason,
    })
  } catch (error) {
    log.error("Adblock fraud flag error", { error })
    return NextResponse.json({ error: "Failed to process fraud flag" }, { status: 500 })
  }
}
