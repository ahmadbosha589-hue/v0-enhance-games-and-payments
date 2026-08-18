// =============================================================================
// =============================================================================
// SERVER-SIDE FORTRESS v6.0 - ULTIMATE DETECTION ENGINE (2026 EDITION)
// =============================================================================
// =============================================================================
//
// ██╗   ██╗██╗  ████████╗██╗███╗   ███╗ █████╗ ████████╗███████╗
// ██║   ██║██║  ╚══██╔══╝██║████╗ ████║██╔══██╗╚══██╔══╝██╔════╝
// ██║   ██║██║     ██║   ██║██╔████╔██║███████║   ██║   █████╗  
// ██║   ██║██║     ██║   ██║██║╚██╔╝██║██╔══██║   ██║   ██╔══╝  
// ╚██████╔╝███████╗██║   ██║██║ ╚═╝ ██║██║  ██║   ██║   ███████╗
//  ╚═════╝ ╚══════╝╚═╝   ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝
//
// v6.0 - AN ATOM BEFORE FALSE POSITIVE | MAXIMUM DETECTION POWER
//
// CORE PRINCIPLES:
// 1. NEVER TRUST CLIENT-SIDE - 100% SERVER-SIDE VERIFICATION ONLY
// 2. ZERO FALSE POSITIVES - MINIMUM 4 INDEPENDENT CONFIRMATIONS
// 3. MAXIMUM DETECTION POWER - 50+ HONEYPOT PROBES, BEHAVIORAL ANALYSIS
// 4. CRYPTOGRAPHIC INTEGRITY - PROOF-OF-WORK + HMAC CHALLENGE-RESPONSE
// 5. CROSS-SESSION CORRELATION - PERSISTENT FRAUD DETECTION
// 6. TIMING ANALYSIS - DETECT CLIENT-SIDE MANIPULATION
// 7. CONTROL PROBE VALIDATION - ABORT IF NETWORK ISSUES DETECTED
//
// =============================================================================


import { headers } from "next/headers"
import { log } from "@/lib/logger"
import crypto from "crypto"

import { requireAdminClient } from "@/lib/supabase/admin-client"
// =============================================================================
// TYPES
// =============================================================================

export interface ServerVerificationRequest {
  userId: string
  sessionId: string
  timestamp: number
  // Client-reported signals (NEVER TRUSTED - only used as hints)
  clientSignals?: {
    method: string
    category: string
    weight: number
    confidence: number
  }[]
  clientConfidence?: number
  clientBlockerType?: string
  // Cryptographic challenge response
  challengeResponse?: {
    challengeId: string
    nonce: string
    proof: string
    timestamp: number
  }
  // Server-side honeypot results (injected by our pages)
  honeypotResults?: {
    probeId: string
    loaded: boolean
    timing: number
    responseCode?: number
  }[]
}

export interface ServerVerificationResult {
  verified: boolean
  isAdblockDetected: boolean
  isVPNDetected: boolean
  isProxyDetected: boolean
  isTorDetected: boolean
  serverScore: number
  confidence: number
  methods: string[]
  factors: Record<string, boolean | number | string>
  shouldBlock: boolean
  riskLevel: "none" | "low" | "medium" | "high" | "critical"
  message: string
}

// =============================================================================
// CRYPTOGRAPHIC CHALLENGE SYSTEM v2.0
// =============================================================================
// Challenge-response with enhanced security: 
// - Time-based one-time challenges
// - Client fingerprint binding
// - Rate limiting per user
// - Proof-of-work requirement

const CHALLENGE_SECRET = process.env.CHALLENGE_SECRET || crypto.randomBytes(64).toString("hex")
const CHALLENGE_TTL_MS = 45000 // 45 seconds (shorter for security)
const POW_DIFFICULTY = 4 // Leading zeros required in hash

interface ChallengeData {
  userId: string
  timestamp: number
  nonce: string
  fingerprint: string
  difficulty: number
}

const challengeStore = new Map<string, ChallengeData>()
const challengeRateLimit = new Map<string, { count: number; resetAt: number }>()

export function generateChallenge(userId: string, fingerprint?: string): {
  challengeId: string
  nonce: string
  timestamp: number
  difficulty: number
} {
  // Rate limit challenge generation
  const rateKey = userId
  const now = Date.now()
  const rateData = challengeRateLimit.get(rateKey)

  if (rateData) {
    if (now < rateData.resetAt) {
      if (rateData.count >= 10) {
        throw new Error("Challenge rate limit exceeded")
      }
      rateData.count++
    } else {
      challengeRateLimit.set(rateKey, { count: 1, resetAt: now + 60000 })
    }
  } else {
    challengeRateLimit.set(rateKey, { count: 1, resetAt: now + 60000 })
  }

  const challengeId = crypto.randomUUID()
  const nonce = crypto.randomBytes(32).toString("hex")
  const timestamp = now

  challengeStore.set(challengeId, {
    userId,
    timestamp,
    nonce,
    fingerprint: fingerprint || "",
    difficulty: POW_DIFFICULTY
  })

  // Aggressive cleanup
  for (const [id, challenge] of challengeStore.entries()) {
    if (now - challenge.timestamp > CHALLENGE_TTL_MS * 1.5) {
      challengeStore.delete(id)
    }
  }

  return { challengeId, nonce, timestamp, difficulty: POW_DIFFICULTY }
}

export function verifyChallenge(
  challengeId: string,
  clientNonce: string,
  proof: string,
  userId: string,
  clientFingerprint?: string
): { valid: boolean; reason: string } {
  const challenge = challengeStore.get(challengeId)

  if (!challenge) {
    return { valid: false, reason: "challenge_not_found" }
  }

  // Immediately delete - one-time use
  challengeStore.delete(challengeId)

  if (challenge.userId !== userId) {
    return { valid: false, reason: "user_mismatch" }
  }

  if (Date.now() - challenge.timestamp > CHALLENGE_TTL_MS) {
    return { valid: false, reason: "challenge_expired" }
  }

  // Optional fingerprint binding
  if (challenge.fingerprint && clientFingerprint && challenge.fingerprint !== clientFingerprint) {
    return { valid: false, reason: "fingerprint_mismatch" }
  }

  // Verify proof-of-work: Hash must start with N zeros
  const proofData = `${challengeId}:${challenge.nonce}:${clientNonce}:${userId}`
  const hash = crypto.createHash("sha256").update(proofData + proof).digest("hex")

  const requiredPrefix = "0".repeat(challenge.difficulty)
  if (!hash.startsWith(requiredPrefix)) {
    return { valid: false, reason: "invalid_pow" }
  }

  // Verify HMAC signature
  const expectedProof = crypto
    .createHmac("sha512", CHALLENGE_SECRET)
    .update(`${challengeId}:${challenge.nonce}:${clientNonce}:${userId}:${hash.slice(0, 16)}`)
    .digest("hex")

  try {
    if (!crypto.timingSafeEqual(Buffer.from(proof, "hex"), Buffer.from(expectedProof, "hex"))) {
      return { valid: false, reason: "invalid_signature" }
    }
  } catch {
    return { valid: false, reason: "invalid_proof_format" }
  }

  return { valid: true, reason: "valid" }
}

// =============================================================================
// ENHANCED HONEYPOT PROBE SYSTEM v2.0
// =============================================================================
// Multi-layer honeypot system with:
// - Dynamic rotating URLs (changes per session)
// - Timing analysis
// - Response verification
// - Multiple probe categories
// - Decoy control probes

interface HoneypotProbe {
  id: string
  url: string
  type: "ad" | "tracking" | "analytics" | "social" | "network" | "control"
  weight: number
  expectedTiming: { min: number; max: number } // Expected load time range in ms
  requiredForDetection: boolean // Must be blocked to confirm adblock
  dynamicPath?: boolean // URL changes per session
}

const HONEYPOT_PROBES: HoneypotProbe[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: HIGH-WEIGHT AD NETWORK HONEYPOTS (Most blocked by adblockers)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "hp_adsense", url: "/api/ads/adsense.js", type: "ad", weight: 98, expectedTiming: { min: 10, max: 500 }, requiredForDetection: true },
  { id: "hp_doubleclick", url: "/api/ads/doubleclick.js", type: "ad", weight: 98, expectedTiming: { min: 10, max: 500 }, requiredForDetection: true },
  { id: "hp_googlesyndication", url: "/api/ads/googlesyndication.js", type: "ad", weight: 98, expectedTiming: { min: 10, max: 500 }, requiredForDetection: true },
  { id: "hp_prebid", url: "/api/ads/prebid.js", type: "ad", weight: 95, expectedTiming: { min: 10, max: 500 }, requiredForDetection: true },
  { id: "hp_gpt", url: "/api/ads/gpt.js", type: "ad", weight: 95, expectedTiming: { min: 10, max: 500 }, requiredForDetection: true },
  { id: "hp_criteo", url: "/api/ads/criteo.js", type: "ad", weight: 94, expectedTiming: { min: 10, max: 500 }, requiredForDetection: false },
  { id: "hp_pubmatic", url: "/api/ads/pubmatic.js", type: "ad", weight: 94, expectedTiming: { min: 10, max: 500 }, requiredForDetection: false },
  { id: "hp_rubicon", url: "/api/ads/rubicon.js", type: "ad", weight: 93, expectedTiming: { min: 10, max: 500 }, requiredForDetection: false },
  { id: "hp_appnexus", url: "/api/ads/appnexus.js", type: "ad", weight: 93, expectedTiming: { min: 10, max: 500 }, requiredForDetection: false },
  { id: "hp_openx", url: "/api/ads/openx.js", type: "ad", weight: 92, expectedTiming: { min: 10, max: 500 }, requiredForDetection: false },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: TRACKING PIXEL HONEYPOTS
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "hp_pixel", url: "/api/ads/pixel.gif", type: "tracking", weight: 90, expectedTiming: { min: 5, max: 300 }, requiredForDetection: false },
  { id: "hp_tracking_pixel", url: "/api/ads/tracking-pixel.gif", type: "tracking", weight: 90, expectedTiming: { min: 5, max: 300 }, requiredForDetection: false },
  { id: "hp_beacon", url: "/api/beacon", type: "tracking", weight: 85, expectedTiming: { min: 5, max: 300 }, requiredForDetection: false },
  { id: "hp_impression", url: "/api/ads/impression.gif", type: "tracking", weight: 88, expectedTiming: { min: 5, max: 300 }, requiredForDetection: false },
  { id: "hp_tracker", url: "/api/ads/tracker.js", type: "tracking", weight: 87, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_view", url: "/api/ads/view.gif", type: "tracking", weight: 85, expectedTiming: { min: 5, max: 300 }, requiredForDetection: false },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: ANALYTICS HONEYPOTS
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "hp_gtm", url: "/api/ads/gtm.js", type: "analytics", weight: 85, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_gtag", url: "/api/ads/gtag.js", type: "analytics", weight: 85, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_analytics", url: "/api/ads/analytics.js", type: "analytics", weight: 82, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_analytics_loader", url: "/api/ads/analytics-loader.js", type: "analytics", weight: 80, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_hotjar", url: "/api/ads/hotjar.js", type: "analytics", weight: 78, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_mixpanel", url: "/api/ads/mixpanel.js", type: "analytics", weight: 76, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_segment", url: "/api/ads/segment.js", type: "analytics", weight: 75, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 4: SOCIAL/PIXEL HONEYPOTS
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "hp_fb_pixel", url: "/api/ads/facebook-pixel.js", type: "social", weight: 88, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_twitter_pixel", url: "/api/ads/twitter-pixel.js", type: "social", weight: 82, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_linkedin", url: "/api/ads/linkedin-insight.js", type: "social", weight: 80, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_tiktok", url: "/api/ads/tiktok-pixel.js", type: "social", weight: 78, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 5: NETWORK LEVEL DETECTION
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "hp_ad_banner", url: "/api/ads/ad-banner.js", type: "network", weight: 92, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false, dynamicPath: true },
  { id: "hp_ad_image", url: "/api/ads/ad-image.png", type: "network", weight: 90, expectedTiming: { min: 5, max: 300 }, requiredForDetection: false, dynamicPath: true },
  { id: "hp_sponsored", url: "/api/ads/sponsored.js", type: "network", weight: 88, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false, dynamicPath: true },
  { id: "hp_promo", url: "/api/ads/promo-banner.jpg", type: "network", weight: 85, expectedTiming: { min: 5, max: 300 }, requiredForDetection: false, dynamicPath: true },

  // ═══════════════════════════════════════════════════════════════════════════
  // v6.0 TIER 6: ADVANCED HONEYPOTS (MAXIMUM DETECTION)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "hp_taboola", url: "/api/ads/taboola.js", type: "ad", weight: 94, expectedTiming: { min: 10, max: 400 }, requiredForDetection: true },
  { id: "hp_outbrain", url: "/api/ads/outbrain.js", type: "ad", weight: 94, expectedTiming: { min: 10, max: 400 }, requiredForDetection: true },
  { id: "hp_amazon", url: "/api/ads/amazon-adsystem.js", type: "ad", weight: 93, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_media_net", url: "/api/ads/media.net.js", type: "ad", weight: 92, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_revcontent", url: "/api/ads/revcontent.js", type: "ad", weight: 90, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_mgid", url: "/api/ads/mgid.js", type: "ad", weight: 89, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_comscore", url: "/api/ads/comscore.js", type: "analytics", weight: 82, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_nielsen", url: "/api/ads/nielsen.js", type: "analytics", weight: 80, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_quantcast", url: "/api/ads/quantcast.js", type: "analytics", weight: 78, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_chartbeat", url: "/api/ads/chartbeat.js", type: "analytics", weight: 76, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_moat", url: "/api/ads/moat.js", type: "tracking", weight: 84, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_clarity", url: "/api/ads/clarity.js", type: "tracking", weight: 82, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_fullstory", url: "/api/ads/fullstory.js", type: "tracking", weight: 80, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_vast", url: "/api/ads/vast.js", type: "ad", weight: 88, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_vpaid", url: "/api/ads/vpaid.js", type: "ad", weight: 86, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_preroll", url: "/api/ads/preroll.js", type: "ad", weight: 84, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_midroll", url: "/api/ads/midroll.js", type: "ad", weight: 82, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_video_ad", url: "/api/ads/video-ad.js", type: "ad", weight: 85, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },

  // v6.0 Additional tracking/analytics probes
  { id: "hp_snapchat", url: "/api/ads/snapchat-pixel.js", type: "social", weight: 75, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_pinterest", url: "/api/ads/pinterest-tag.js", type: "social", weight: 74, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_reddit", url: "/api/ads/reddit-pixel.js", type: "social", weight: 73, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_index_ex", url: "/api/ads/index-exchange.js", type: "ad", weight: 91, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_sharethrough", url: "/api/ads/sharethrough.js", type: "ad", weight: 88, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_triplelift", url: "/api/ads/triplelift.js", type: "ad", weight: 87, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_teads", url: "/api/ads/teads.js", type: "ad", weight: 86, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },
  { id: "hp_33across", url: "/api/ads/33across.js", type: "ad", weight: 85, expectedTiming: { min: 10, max: 400 }, requiredForDetection: false },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL PROBES - MUST ALWAYS LOAD (False positive detection)
  // CRITICAL: If any control fails, detection is ABORTED to prevent FP
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "ctrl_health", url: "/api/health", type: "control", weight: 0, expectedTiming: { min: 5, max: 1000 }, requiredForDetection: false },
  { id: "ctrl_stats", url: "/api/stats", type: "control", weight: 0, expectedTiming: { min: 5, max: 1000 }, requiredForDetection: false },
  { id: "ctrl_faucet", url: "/api/faucet-health", type: "control", weight: 0, expectedTiming: { min: 5, max: 1000 }, requiredForDetection: false },
  { id: "ctrl_collect", url: "/api/collect", type: "control", weight: 0, expectedTiming: { min: 5, max: 1000 }, requiredForDetection: false },
  // v6.0 Additional control probes
  { id: "ctrl_metrics", url: "/api/metrics", type: "control", weight: 0, expectedTiming: { min: 5, max: 1000 }, requiredForDetection: false },
  { id: "ctrl_beacon", url: "/api/beacon", type: "control", weight: 0, expectedTiming: { min: 5, max: 1000 }, requiredForDetection: false },
]

export function getHoneypotProbes(sessionId?: string) {
  // Generate dynamic paths for probes that support it
  const hash = sessionId ? crypto.createHash("md5").update(sessionId).digest("hex").slice(0, 8) : ""

  return HONEYPOT_PROBES.map(probe => {
    if (probe.dynamicPath && hash) {
      return {
        ...probe,
        url: probe.url.replace(/\.([^.]+)$/, `-${hash}.$1`),
      }
    }
    return probe
  })
}

export interface HoneypotVerificationResult {
  isAdblockDetected: boolean
  confidence: number
  blockedProbes: string[]
  controlsBlocked: boolean
  methods: string[]
  timingAnomaly: boolean
  categoriesBlocked: string[]
  weightedScore: number
}

export function verifyHoneypotResults(
  results: { probeId: string; loaded: boolean; timing: number; responseCode?: number }[]
): HoneypotVerificationResult {
  const blockedProbes: string[] = []
  const methods: string[] = []
  const categoriesBlocked = new Set<string>()

  let adProbesTotal = 0
  let adProbesBlocked = 0
  let requiredProbesBlocked = 0
  let controlsBlocked = false
  let totalWeight = 0
  let blockedWeight = 0
  let timingAnomaly = false

  for (const result of results) {
    const probe = HONEYPOT_PROBES.find(p => p.id === result.probeId)
    if (!probe) continue

    if (probe.type === "control") {
      // Control probes MUST always load - if not, abort detection
      if (!result.loaded) {
        controlsBlocked = true
      }
      // Check timing anomaly - control probes should be fast
      if (result.loaded && result.timing > probe.expectedTiming.max * 3) {
        // Extremely slow control = network issues, not adblock
        controlsBlocked = true
      }
    } else {
      adProbesTotal++
      totalWeight += probe.weight

      if (!result.loaded) {
        adProbesBlocked++
        blockedWeight += probe.weight
        blockedProbes.push(result.probeId)
        categoriesBlocked.add(probe.type)
        methods.push(`honeypot_${probe.type}_blocked`)

        if (probe.requiredForDetection) {
          requiredProbesBlocked++
        }
      } else {
        // Check for timing manipulation (trying to fake success)
        if (result.timing < probe.expectedTiming.min * 0.5) {
          // Suspiciously fast - could be cached empty response from blocker
          timingAnomaly = true
        }
        if (result.timing === 0 || result.timing === undefined) {
          // Zero timing = likely blocked but reported as loaded
          timingAnomaly = true
          adProbesBlocked += 0.5 // Partial count
          blockedWeight += probe.weight * 0.5
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // v6.0 ENHANCED FALSE POSITIVE PROTECTION (AN ATOM BEFORE FP)
  // ═══════════════════════════════════════════════════════════════════════════

  // CRITICAL: If ANY control probe is blocked, DO NOT flag as adblock
  // This is the PRIMARY mechanism for zero false positives
  // Controls should NEVER be blocked by any legitimate adblocker
  if (controlsBlocked) {
    return {
      isAdblockDetected: false,
      confidence: 0,
      blockedProbes: [],
      controlsBlocked: true,
      methods: ["control_blocked_abort_fp_protection"],
      timingAnomaly: false,
      categoriesBlocked: [],
      weightedScore: 0,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // v6.0 ULTRA-STRICT DETECTION LOGIC (MAXIMUM POWER | ZERO FP)
  // ═══════════════════════════════════════════════════════════════════════════

  const blockRatio = adProbesTotal > 0 ? adProbesBlocked / adProbesTotal : 0
  const weightedRatio = totalWeight > 0 ? blockedWeight / totalWeight : 0

  // STRICT DETECTION REQUIREMENTS (v6.0 enhanced):
  // 1. At least 4 ad probes blocked (increased from 3 for more confidence)
  // 2. At least 3 REQUIRED probes blocked (definite adblock targets)
  // 3. Block ratio >= 35% (stricter threshold)
  // 4. Multiple categories blocked (3+ for strong detection)
  // 5. Weighted ratio >= 25% (high-value targets blocked)
  const hasStrongEvidence =
    adProbesBlocked >= 4 &&
    requiredProbesBlocked >= 3 &&
    blockRatio >= 0.35 &&
    categoriesBlocked.size >= 3 &&
    weightedRatio >= 0.25

  // MODERATE detection - still requires multiple confirmations
  const hasModerateEvidence =
    adProbesBlocked >= 5 &&
    requiredProbesBlocked >= 2 &&
    blockRatio >= 0.30 &&
    categoriesBlocked.size >= 2

  // VERY STRONG detection - overwhelming evidence
  const hasOverwhelmingEvidence =
    adProbesBlocked >= 8 &&
    requiredProbesBlocked >= 4 &&
    blockRatio >= 0.50 &&
    categoriesBlocked.size >= 4

  // Final detection - require at least moderate evidence
  const isDetected = hasStrongEvidence || hasModerateEvidence || hasOverwhelmingEvidence

  // Calculate confidence based on evidence strength
  let confidence = 0
  if (isDetected) {
    if (hasOverwhelmingEvidence) {
      // Overwhelming evidence = very high confidence
      confidence = Math.min(45 + (weightedRatio * 50), 97)
    } else if (hasStrongEvidence) {
      // Strong evidence = high confidence
      confidence = Math.min(40 + (weightedRatio * 48), 94)
    } else {
      // Moderate evidence = moderate confidence
      confidence = Math.min(35 + (weightedRatio * 45), 88)
    }

    // Bonus for more categories blocked
    confidence += Math.min(categoriesBlocked.size * 2.5, 10)

    // Bonus for many probes blocked
    confidence += Math.min(adProbesBlocked * 1.2, 12)

    // Penalty for timing anomaly (could indicate client manipulation)
    if (timingAnomaly) {
      confidence = Math.max(confidence - 12, 35)
    }

    // Never 100% - always leave room for edge cases (an atom before FP)
    confidence = Math.min(confidence, 96)
  }

  return {
    isAdblockDetected: isDetected,
    confidence,
    blockedProbes,
    controlsBlocked: false,
    methods: [...new Set(methods)],
    timingAnomaly,
    categoriesBlocked: Array.from(categoriesBlocked),
    weightedScore: weightedRatio * 100,
  }
}

// =============================================================================
// REQUEST FINGERPRINTING (SERVER-SIDE)
// =============================================================================

export interface RequestFingerprint {
  ipAddress: string
  userAgent: string | null
  acceptLanguage: string | null
  acceptEncoding: string | null
  secFetchSite: string | null
  secFetchMode: string | null
  secFetchDest: string | null
  secChUa: string | null
  secChUaMobile: string | null
  secChUaPlatform: string | null
  cfConnectingIp: string | null
  cfIpcountry: string | null
  cfRay: string | null
  xForwardedFor: string | null
  xRealIp: string | null
  dnt: string | null
  upgradeInsecureRequests: string | null
  referer: string | null
  origin: string | null
  // New v5.0 fingerprint fields
  secChUaArch: string | null
  secChUaBitness: string | null
  secChUaFullVersion: string | null
  secChUaPlatformVersion: string | null
  secChUaModel: string | null
  priority: string | null
  connection: string | null
  cacheControl: string | null
  via: string | null
  xRequestedWith: string | null
  contentType: string | null
  cookie: string | null // Cookie presence (not content)
}

export async function getRequestFingerprint(): Promise<RequestFingerprint> {
  const headersList = await headers()

  const forwarded = headersList.get("x-forwarded-for")
  const ipAddress = forwarded
    ? forwarded.split(",")[0].trim()
    : headersList.get("x-real-ip")
    || headersList.get("cf-connecting-ip")
    || "127.0.0.1"

  return {
    ipAddress,
    userAgent: headersList.get("user-agent"),
    acceptLanguage: headersList.get("accept-language"),
    acceptEncoding: headersList.get("accept-encoding"),
    secFetchSite: headersList.get("sec-fetch-site"),
    secFetchMode: headersList.get("sec-fetch-mode"),
    secFetchDest: headersList.get("sec-fetch-dest"),
    secChUa: headersList.get("sec-ch-ua"),
    secChUaMobile: headersList.get("sec-ch-ua-mobile"),
    secChUaPlatform: headersList.get("sec-ch-ua-platform"),
    cfConnectingIp: headersList.get("cf-connecting-ip"),
    cfIpcountry: headersList.get("cf-ipcountry"),
    cfRay: headersList.get("cf-ray"),
    xForwardedFor: headersList.get("x-forwarded-for"),
    xRealIp: headersList.get("x-real-ip"),
    dnt: headersList.get("dnt"),
    upgradeInsecureRequests: headersList.get("upgrade-insecure-requests"),
    referer: headersList.get("referer"),
    origin: headersList.get("origin"),
    // New v5.0 fields
    secChUaArch: headersList.get("sec-ch-ua-arch"),
    secChUaBitness: headersList.get("sec-ch-ua-bitness"),
    secChUaFullVersion: headersList.get("sec-ch-ua-full-version"),
    secChUaPlatformVersion: headersList.get("sec-ch-ua-platform-version"),
    secChUaModel: headersList.get("sec-ch-ua-model"),
    priority: headersList.get("priority"),
    connection: headersList.get("connection"),
    cacheControl: headersList.get("cache-control"),
    via: headersList.get("via"),
    xRequestedWith: headersList.get("x-requested-with"),
    contentType: headersList.get("content-type"),
    cookie: headersList.get("cookie") ? "present" : null, // Privacy-preserving
  }
}

// =============================================================================
// ADVANCED BEHAVIORAL ANOMALY DETECTION (SERVER-SIDE)
// =============================================================================

interface BehaviorAnalysisResult {
  anomalyScore: number
  factors: Record<string, boolean | number | string>
  patterns: string[]
  isBot: boolean
  isSuspicious: boolean
}

async function analyzeUserBehavior(
  userId: string,
  currentFingerprint: RequestFingerprint
): Promise<BehaviorAnalysisResult> {
  const supabase = requireAdminClient()
  const factors: Record<string, boolean | number | string> = {}
  const patterns: string[] = []
  let anomalyScore = 0

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 1: REQUEST PATTERN ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  const { data: recentActivity } = await supabase
    .from("user_activity_log")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200)

  if (!recentActivity || recentActivity.length < 5) {
    factors.insufficientHistory = true
    return { anomalyScore: 0, factors, patterns, isBot: false, isSuspicious: false }
  }

  // Analyze request intervals
  const intervals: number[] = []
  for (let i = 1; i < Math.min(recentActivity.length, 50); i++) {
    const interval = new Date(recentActivity[i - 1].created_at).getTime() -
      new Date(recentActivity[i].created_at).getTime()
    intervals.push(interval)
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const minInterval = Math.min(...intervals)
  const maxInterval = Math.max(...intervals)
  const intervalVariance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length

  // Bot detection: Too-fast or too-regular requests
  if (minInterval < 50) {
    anomalyScore += 25
    factors.suspiciouslyFastRequests = true
    patterns.push("bot_like_speed")
  }

  // Very low variance = automated behavior
  if (intervalVariance < 1000 && intervals.length >= 10) {
    anomalyScore += 15
    factors.regularIntervals = true
    patterns.push("automated_pattern")
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 2: IP CONSISTENCY ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  const recentIPs = recentActivity.slice(0, 50).map(a => a.ip_address).filter(Boolean)
  const uniqueIPs = new Set(recentIPs)

  if (uniqueIPs.size > 10) {
    anomalyScore += 20
    factors.manyUniqueIPs = uniqueIPs.size
    patterns.push("ip_rotation")
  } else if (uniqueIPs.size > 5) {
    anomalyScore += 10
    factors.multipleIPs = uniqueIPs.size
  }

  // Check for rapid IP switching
  let ipSwitches = 0
  for (let i = 1; i < Math.min(recentIPs.length, 20); i++) {
    if (recentIPs[i] !== recentIPs[i - 1]) {
      ipSwitches++
    }
  }

  if (ipSwitches > 5) {
    anomalyScore += 15
    factors.rapidIPSwitching = ipSwitches
    patterns.push("rapid_ip_switching")
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 3: USER AGENT CONSISTENCY
  // ═══════════════════════════════════════════════════════════════════════════

  const recentUAs = recentActivity.slice(0, 50).map(a => a.user_agent).filter(Boolean)
  const uniqueUAs = new Set(recentUAs)

  if (uniqueUAs.size > 5) {
    anomalyScore += 15
    factors.manyUserAgents = uniqueUAs.size
    patterns.push("ua_rotation")
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 4: FRAUD FLAG HISTORY
  // ═══════════════════════════════════════════════════════════════════════════

  const { data: fraudFlags } = await supabase
    .from("fraud_flags")
    .select("flag_type, severity, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (fraudFlags) {
    const adblockFlags = fraudFlags.filter(f => f.flag_type === "adblock" || f.flag_type === "adblock_user")
    const vpnFlags = fraudFlags.filter(f => f.flag_type === "vpn_detected")
    const botFlags = fraudFlags.filter(f => f.flag_type === "bot_detected")

    if (adblockFlags.length >= 3) {
      anomalyScore += 25
      factors.repeatAdblockOffender = true
      factors.adblockFlagCount = adblockFlags.length
      patterns.push("repeat_adblock_offender")
    } else if (adblockFlags.length >= 1) {
      anomalyScore += 10
      factors.previousAdblockFlag = true
    }

    if (vpnFlags.length >= 1) {
      anomalyScore += 15
      factors.previousVPNDetection = true
      patterns.push("vpn_history")
    }

    if (botFlags.length >= 1) {
      anomalyScore += 20
      factors.previousBotFlag = true
      patterns.push("bot_history")
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 5: SESSION BEHAVIOR
  // ═══════════════════════════════════════════════════════════════════════════

  const { data: profile } = await supabase
    .from("profiles")
    .select("created_at, total_claims, total_earned, fraud_score")
    .eq("id", userId)
    .single()

  if (profile) {
    const accountAgeMs = Date.now() - new Date(profile.created_at).getTime()
    const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24)

    // New account with suspicious patterns
    if (accountAgeDays < 1 && anomalyScore > 20) {
      anomalyScore += 15
      factors.newAccountSuspicious = true
      patterns.push("new_account_suspicious")
    }

    // Previous fraud score
    if (profile.fraud_score && profile.fraud_score >= 50) {
      anomalyScore += Math.min(profile.fraud_score * 0.3, 25)
      factors.existingFraudScore = profile.fraud_score
    }
  }

  // Determine final status
  const isBot = anomalyScore >= 60 || patterns.includes("bot_like_speed")
  const isSuspicious = anomalyScore >= 30

  return { anomalyScore, factors, patterns, isBot, isSuspicious }
}

// =============================================================================
// SERVER-SIDE REQUEST LOGGING FOR HONEYPOT VERIFICATION
// =============================================================================

interface HoneypotRequestLog {
  timestamp: number
  loaded: boolean
  responseCode?: number
  timing?: number
  headers?: Record<string, string>
}

const honeypotRequestLog = new Map<string, Map<string, HoneypotRequestLog>>()

export function logHoneypotRequest(
  sessionId: string,
  probeId: string,
  loaded: boolean,
  additionalData?: { responseCode?: number; timing?: number; headers?: Record<string, string> }
) {
  if (!honeypotRequestLog.has(sessionId)) {
    honeypotRequestLog.set(sessionId, new Map())
  }

  honeypotRequestLog.get(sessionId)!.set(probeId, {
    timestamp: Date.now(),
    loaded,
    responseCode: additionalData?.responseCode,
    timing: additionalData?.timing,
    headers: additionalData?.headers,
  })

  // Aggressive cleanup - 5 minutes
  const now = Date.now()
  for (const [sid, probes] of honeypotRequestLog.entries()) {
    const timestamps = Array.from(probes.values()).map(p => p.timestamp)
    const oldestProbe = timestamps.length > 0 ? Math.min(...timestamps) : now
    if (now - oldestProbe > 300000) {
      honeypotRequestLog.delete(sid)
    }
  }
}

export function getServerHoneypotResults(sessionId: string): Map<string, HoneypotRequestLog> | undefined {
  return honeypotRequestLog.get(sessionId)
}

// =============================================================================
// CROSS-SESSION FINGERPRINT CORRELATION
// =============================================================================

async function checkCrossSessionFingerprints(
  userId: string,
  fingerprint: RequestFingerprint
): Promise<{ isLinked: boolean; linkedUsers: string[]; confidence: number }> {
  const supabase = requireAdminClient()

  // Create fingerprint hash (privacy-preserving)
  const fpData = [
    fingerprint.userAgent || "",
    fingerprint.acceptLanguage || "",
    fingerprint.secChUa || "",
    fingerprint.secChUaPlatform || "",
    fingerprint.acceptEncoding || "",
  ].join("|")

  const fpHash = crypto.createHash("sha256").update(fpData).digest("hex")

  // Check for other users with same fingerprint
  const { data: similarProfiles } = await supabase
    .from("profiles")
    .select("id, fingerprint_hash, last_active_at")
    .eq("fingerprint_hash", fpHash)
    .neq("id", userId)
    .limit(10)

  if (!similarProfiles || similarProfiles.length === 0) {
    return { isLinked: false, linkedUsers: [], confidence: 0 }
  }

  // Check if IPs also match
  const { data: currentUserIPs } = await supabase
    .from("user_activity_log")
    .select("ip_address")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10)

  const userIPs = new Set(currentUserIPs?.map(a => a.ip_address) || [])
  const linkedUsers: string[] = []

  for (const profile of similarProfiles) {
    const { data: profileIPs } = await supabase
      .from("user_activity_log")
      .select("ip_address")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(10)

    const otherIPs = new Set(profileIPs?.map(a => a.ip_address) || [])

    // Check for IP overlap
    for (const ip of userIPs) {
      if (otherIPs.has(ip)) {
        linkedUsers.push(profile.id)
        break
      }
    }
  }

  return {
    isLinked: linkedUsers.length > 0,
    linkedUsers,
    confidence: Math.min(70 + (linkedUsers.length * 10), 95),
  }
}

// =============================================================================
// MAIN VERIFICATION ENGINE v5.0
// =============================================================================

export async function performServerVerification(
  request: ServerVerificationRequest,
  fingerprint: RequestFingerprint
): Promise<ServerVerificationResult> {
  const startTime = Date.now()
  const factors: Record<string, boolean | number | string> = {}
  const methods: string[] = []
  let serverScore = 0

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 1: CRYPTOGRAPHIC CHALLENGE VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  if (request.challengeResponse) {
    const challengeResult = verifyChallenge(
      request.challengeResponse.challengeId,
      request.challengeResponse.nonce,
      request.challengeResponse.proof,
      request.userId
    )

    factors.challengeValid = challengeResult.valid
    if (!challengeResult.valid) {
      factors.challengeFailReason = challengeResult.reason
      serverScore += 25 // Higher penalty for challenge failure
      methods.push("challenge_failed")

      // Challenge replay or manipulation = immediate high suspicion
      if (challengeResult.reason === "challenge_not_found" || challengeResult.reason === "invalid_pow") {
        serverScore += 15
        methods.push("challenge_manipulation_suspected")
      }
    }
  } else {
    factors.noChallenge = true
    serverScore += 5 // Small penalty for missing challenge
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 2: SERVER-SIDE HONEYPOT VERIFICATION (PRIMARY)
  // ═══════════════════════════════════════════════════════════════════════════

  const serverHoneypotResults = getServerHoneypotResults(request.sessionId)

  let honeypotScore = 0
  let honeypotConfidence = 0
  let controlsBlockedServer = false
  let serverBlockedProbes = 0
  let serverTotalProbes = 0

  if (serverHoneypotResults && serverHoneypotResults.size > 0) {
    factors.serverHoneypotVerified = true

    // Server-side verification - MOST RELIABLE
    for (const probe of HONEYPOT_PROBES) {
      const result = serverHoneypotResults.get(probe.id)

      if (probe.type === "control") {
        if (!result || !result.loaded) {
          controlsBlockedServer = true
          factors.serverControlBlocked = probe.id
        }
      } else {
        serverTotalProbes++
        if (!result || !result.loaded) {
          serverBlockedProbes++
        }
      }
    }

    const serverBlockRatio = serverTotalProbes > 0 ? serverBlockedProbes / serverTotalProbes : 0

    // Server verification requires multiple blocked probes - v8.0: stricter thresholds
    // Require 6+ blocked probes (up from 4) and 45%+ ratio (up from 35%)
    if (!controlsBlockedServer && serverBlockedProbes >= 6 && serverBlockRatio >= 0.45) {
      honeypotScore = Math.min(45 + (serverBlockRatio * 40), 85) // Lower base scores
      honeypotConfidence = Math.min(50 + (serverBlockRatio * 35), 90) // Lower max confidence
      methods.push("server_honeypot_blocked")
      factors.serverBlockRatio = serverBlockRatio
      factors.serverBlockedCount = serverBlockedProbes
    }
  } else {
    factors.noServerHoneypotData = true
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 3: CLIENT HONEYPOT CROSS-VALIDATION (SECONDARY)
  // ═══════════════════════════════════════════════════════════════════════════

  if (request.honeypotResults && request.honeypotResults.length > 0) {
    const clientHoneypotResult = verifyHoneypotResults(request.honeypotResults)

    if (clientHoneypotResult.controlsBlocked) {
      // Control blocked = ABORT (potential false positive)
      factors.clientControlBlocked = true
      return {
        verified: false,
        isAdblockDetected: false,
        isVPNDetected: false,
        isProxyDetected: false,
        isTorDetected: false,
        serverScore: 0,
        confidence: 0,
        methods: ["control_blocked_abort"],
        factors,
        shouldBlock: false,
        riskLevel: "none",
        message: "Verification aborted - control probes blocked (potential network issue)",
      }
    }

    factors.clientHoneypotConfidence = clientHoneypotResult.confidence
    factors.clientBlockedCount = clientHoneypotResult.blockedProbes.length
    factors.clientCategoriesBlocked = clientHoneypotResult.categoriesBlocked.length

    // Cross-validate with server results
    if (serverHoneypotResults && clientHoneypotResult.isAdblockDetected) {
      // Both server and client agree = STRONG confidence
      honeypotScore = Math.max(honeypotScore, clientHoneypotResult.weightedScore + 15)
      honeypotConfidence = Math.max(honeypotConfidence, clientHoneypotResult.confidence + 10)
      methods.push("honeypot_cross_validated")
      factors.crossValidated = true
    } else if (clientHoneypotResult.isAdblockDetected && !serverHoneypotResults) {
      // Client only - lower confidence, but still consider
      honeypotScore += clientHoneypotResult.weightedScore * 0.4
      honeypotConfidence = clientHoneypotResult.confidence * 0.5
      methods.push("client_honeypot_only")
    }

    // Timing anomaly detection
    if (clientHoneypotResult.timingAnomaly) {
      factors.timingAnomaly = true
      honeypotConfidence = Math.max(honeypotConfidence - 10, 0)
    }
  }

  serverScore += honeypotScore

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 4: CLIENT SIGNAL ANALYSIS (CORROBORATION ONLY)
  // ═══════════════════════════════════════════════════════════════════════════

  if (request.clientSignals && request.clientSignals.length > 0) {
    const categories = new Set(request.clientSignals.map(s => s.category))
    const highWeightSignals = request.clientSignals.filter(s => s.weight >= 75)
    const baitSignals = request.clientSignals.filter(s => s.category === "bait")

    factors.clientSignalCategories = categories.size
    factors.clientHighWeightSignals = highWeightSignals.length
    factors.clientBaitSignals = baitSignals.length

    // Client signals ONLY add score if they corroborate server findings
    if (honeypotScore >= 35 && categories.size >= 3 && highWeightSignals.length >= 2) {
      serverScore += Math.min(request.clientConfidence || 0, 15) * 0.4
      methods.push("client_corroborated")
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 5: BEHAVIORAL ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  const behaviorAnalysis = await analyzeUserBehavior(request.userId, fingerprint)
  serverScore += behaviorAnalysis.anomalyScore

  for (const [key, value] of Object.entries(behaviorAnalysis.factors)) {
    factors[`behavior_${key}`] = value
  }

  for (const pattern of behaviorAnalysis.patterns) {
    methods.push(`behavior_${pattern}`)
  }

  if (behaviorAnalysis.isBot) {
    serverScore += 30
    factors.isBotLikeBehavior = true
    methods.push("bot_behavior_detected")
  } else if (behaviorAnalysis.isSuspicious) {
    serverScore += 10
    factors.isSuspiciousBehavior = true
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 6: CROSS-SESSION FINGERPRINT CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  const crossSessionResult = await checkCrossSessionFingerprints(request.userId, fingerprint)

  if (crossSessionResult.isLinked) {
    factors.linkedAccounts = crossSessionResult.linkedUsers.length
    factors.linkedAccountIds = crossSessionResult.linkedUsers.join(",")
    serverScore += Math.min(crossSessionResult.linkedUsers.length * 10, 25)
    methods.push("multi_account_correlation")
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 7: HISTORICAL PATTERN MATCHING
  // ═══════════════════════════════════════════════════════════════════════════

  const supabase = requireAdminClient()

  const { data: detectionHistory } = await supabase
    .from("adblock_analytics")
    .select("*")
    .eq("user_id", request.userId)
    .order("created_at", { ascending: false })
    .limit(20)

  if (detectionHistory && detectionHistory.length > 0) {
    // v8.0: Only count server-verified detections for history
    const recentDetections = detectionHistory.filter(d => d.adblock_detected && d.server_verified)

    if (recentDetections.length >= 7) { // Up from 5
      // Chronic offender - must have many server-verified detections
      serverScore += 20 // Reduced from 25
      factors.chronicOffender = true
      factors.previousDetections = recentDetections.length
      methods.push("history_chronic_offender")
    } else if (recentDetections.length >= 5) { // Up from 3
      serverScore += 12 // Reduced from 15
      factors.repeatOffender = true
      factors.previousDetections = recentDetections.length
      methods.push("history_repeat_offender")
    }

    // Check blocker type consistency
    const blockerTypes = recentDetections
      .map(d => d.blocker_type)
      .filter(Boolean)

    if (blockerTypes.length >= 3 && new Set(blockerTypes).size === 1) {
      serverScore += 8
      factors.consistentBlockerType = blockerTypes[0]
      methods.push("history_consistent_blocker")
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 8: PRIVACY BROWSER CORRELATION
  // ═══════════════════════════════════════════════════════════════════════════

  const ua = fingerprint.userAgent?.toLowerCase() || ""
  const privacyBrowsers = [
    { pattern: "brave", weight: 12, name: "Brave" },
    { pattern: "duckduckgo", weight: 8, name: "DuckDuckGo" },
    { pattern: "tor browser", weight: 30, name: "Tor Browser" },
    { pattern: "firefox focus", weight: 10, name: "Firefox Focus" },
    { pattern: "onion", weight: 25, name: "Onion Browser" },
    { pattern: "librewolf", weight: 15, name: "LibreWolf" },
    { pattern: "ungoogled", weight: 12, name: "Ungoogled Chromium" },
  ]

  for (const browser of privacyBrowsers) {
    if (ua.includes(browser.pattern)) {
      factors.privacyBrowser = browser.name
      // Privacy browsers with ad blocking signals = stronger correlation
      if (honeypotScore >= 25) {
        serverScore += browser.weight
        methods.push(`privacy_browser_${browser.name.toLowerCase().replace(/\s+/g, "_")}`)
      }
      break
    }
  }

  // DNT header correlation
  if (fingerprint.dnt === "1") {
    factors.dntEnabled = true
    if (honeypotScore >= 30) {
      serverScore += 3
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // v6.0 FINAL SCORING & DECISION (MAXIMUM POWER | ZERO FALSE POSITIVES)
  // ═══════════════════════════════════════════════════════════════════════════

  // Normalize score
  serverScore = Math.min(serverScore, 100)

  // ═══════════════════════════════════════════════════════════════════════════
  // ULTRA-STRICT REQUIREMENTS FOR ZERO FALSE POSITIVES:
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Server honeypot score >= 50 (server MUST verify blocked probes)
  // 2. Control probes must NOT be blocked (CRITICAL - abort if blocked)
  // 3. Multiple independent detection methods (3+ methods required)
  // 4. Cross-validation between server and client data
  // 5. Historical pattern matching for repeat offenders
  // ═══════════════════════════════════════════════════════════════════════════

  // Strong evidence from server honeypots (v8.0: stricter thresholds)
  const hasStrongServerEvidence =
    honeypotScore >= 60 && // Up from 50
    !controlsBlockedServer &&
    methods.filter(m => m.includes("honeypot") || m.includes("server")).length >= 3 // Up from 2

  // Cross-validated evidence (server + client agree) - v8.0: stricter
  const hasCrossValidatedEvidence =
    factors.crossValidated === true &&
    honeypotScore >= 55 && // Up from 40
    !controlsBlockedServer

  // Historical chronic offender with current suspicious behavior - v8.0: stricter
  const isChronicOffenderActive =
    factors.chronicOffender === true &&
    behaviorAnalysis.isSuspicious &&
    honeypotScore >= 45 && // Up from 30
    serverBlockedProbes >= 6 // Need substantial blocked probes too

  // Repeat offender with strong current evidence - v8.0: stricter
  const isRepeatOffenderActive =
    factors.repeatOffender === true &&
    honeypotScore >= 55 && // Up from 40
    behaviorAnalysis.anomalyScore >= 35 // Up from 25

  // FINAL DETECTION DECISION - require overwhelming evidence
  const isAdblockDetected =
    hasStrongServerEvidence ||
    hasCrossValidatedEvidence ||
    isChronicOffenderActive ||
    isRepeatOffenderActive

  // Risk level calculation with stricter thresholds
  let riskLevel: "none" | "low" | "medium" | "high" | "critical" = "none"
  if (serverScore >= 88) riskLevel = "critical"
  else if (serverScore >= 68) riskLevel = "high"
  else if (serverScore >= 48) riskLevel = "medium"
  else if (serverScore >= 28) riskLevel = "low"

  // ═══════════════════════════════════════════════════════════════════════════
  // v8.0 BLOCKING DECISION (ZERO FALSE POSITIVES - MAXIMUM STRICTNESS)
  // ═══════════════════════════════════════════════════════════════════════════
  // Only block when we have ABSOLUTELY INCONTROVERTIBLE evidence:
  // - Multiple server-side confirmations (5+ methods - up from 4)
  // - Very high confidence from honeypot verification (80%+ - up from 70%)
  // - Very high server score (75+ - up from 65)
  // - Controls NEVER blocked (critical FP protection)
  // - MUST have cross-validation AND strong server evidence
  const shouldBlock =
    isAdblockDetected &&
    serverScore >= 75 && // Stricter: was 65
    honeypotConfidence >= 80 && // Stricter: was 70
    methods.length >= 5 && // Stricter: was 4
    !controlsBlockedServer &&
    hasStrongServerEvidence && // MUST have strong server evidence
    (factors.crossValidated === true || factors.chronicOffender === true) // AND cross-validation or chronic

  // Final confidence - conservative calculation
  let confidence = honeypotConfidence
  if (behaviorAnalysis.isSuspicious) confidence += 4
  if (factors.crossValidated) confidence += 8
  if (factors.chronicOffender) confidence += 6
  if (factors.repeatOffender) confidence += 4
  // Never 100% - always leave room for edge cases (an atom before FP)
  confidence = Math.min(confidence, 96)

  // Log verification
  log.info("Server Fortress v6.0 verification complete", {
    userId: request.userId,
    sessionId: request.sessionId,
    serverScore,
    confidence,
    isAdblockDetected,
    shouldBlock,
    riskLevel,
    methods: methods.slice(0, 10),
    duration: Date.now() - startTime,
  })

  return {
    verified: true,
    isAdblockDetected,
    isVPNDetected: false, // VPN detection handled separately
    isProxyDetected: false,
    isTorDetected: false,
    serverScore,
    confidence,
    methods,
    factors,
    shouldBlock,
    riskLevel,
    message: shouldBlock
      ? "Adblock detected with very high server-side confidence"
      : isAdblockDetected
        ? "Adblock detected but below blocking threshold"
        : "No adblock detected",
  }
}
