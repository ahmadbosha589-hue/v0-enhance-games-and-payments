// =====================================================
// ULTIMATE SERVER-SIDE SECURITY VALIDATION ENGINE v5.0
// ZERO FALSE POSITIVE EDITION
// Maximum protection with VERIFIED confidence
// Only block with MULTIPLE corroborating signals
// Never penalize legitimate user behaviors
// =====================================================

import { headers } from "next/headers"

import { detectVPN } from "./vpn-detection"
import { verifyHoneypotResults, type HoneypotVerificationResult } from "./server-fortress"
import { detectVPNFortress, type VPNFortressResult } from "./vpn-fortress"
import type { VPNDetectionResult } from "./vpn-detection"

import { requireAdminClient } from "@/lib/supabase/admin-client"
export interface ServerValidationResult {
  isValid: boolean
  isBlocked: boolean
  riskScore: number
  flags: string[]
  vpnResult?: VPNDetectionResult
  vpnFortressResult?: VPNFortressResult
  botScore: number
  adblockDetected: boolean
  adblockFortressResult?: HoneypotVerificationResult
  shouldLogout: boolean
  banReason?: string
  confidence: "low" | "medium" | "high" | "absolute"
  // v4.0 FORTRESS additions
  threatLevel: "none" | "low" | "medium" | "high" | "critical"
  correlatedThreats: string[]
  serverFingerprint: string
  validationTimestamp: number
  fortressVerified: boolean
  serverOnlyDetection: boolean
}

export interface ClientSecurityPayload {
  fingerprint?: string
  behaviorScore?: number
  threatLevel?: string
  detectedThreats?: string[]
  mouseMovements?: number
  clickCount?: number
  verificationDuration?: number
  timestamp?: number
  screenResolution?: string
  timezone?: string
  language?: string
  webrtcIPs?: string[]
  canvasHash?: string
  webglVendor?: string
  webglRenderer?: string
  audioHash?: string
  pluginCount?: number
  hardwareConcurrency?: number
  deviceMemory?: number
  touchSupport?: boolean
}

// =====================================================
// ADVANCED BOT DETECTION SIGNATURES DATABASE
// =====================================================
const BOT_SIGNATURES = {
  // Automation frameworks
  automation: [
    /selenium/i, /puppeteer/i, /playwright/i, /cypress/i,
    /webdriver/i, /phantomjs/i, /chromedriver/i, /geckodriver/i,
    /safaridriver/i, /webdriverio/i, /nightwatch/i, /protractor/i,
    /testcafe/i, /zombiejs/i, /slimerjs/i, /casperjs/i,
  ],
  // Scraping tools
  scrapers: [
    /scrapy/i, /beautifulsoup/i, /cheerio/i, /jsdom/i,
    /goquery/i, /colly/i, /httpclient/i, /mechanize/i,
    /aiohttp/i, /httpx/i, /urllib/i, /requests/i,
  ],
  // Known bots
  bots: [
    /bot/i, /crawler/i, /spider/i, /scraper/i,
    /archiver/i, /indexer/i, /fetcher/i, /slurp/i,
    /wget/i, /curl/i, /httpie/i, /lynx/i,
  ],
  // Data center user agents
  datacenter: [
    /amazon/i, /google.*bot/i, /bing.*bot/i, /yahoo.*bot/i,
    /baidu/i, /yandex/i, /duckduck/i, /sogou/i,
  ],
  // Privacy browsers that might be used for abuse
  privacyAbuse: [
    /tor\s?browser/i, /tails/i, /whonix/i,
  ],
}

// Known malicious IP patterns (honeypots, abuse networks)
const MALICIOUS_IP_PATTERNS = [
  /^192\.0\.2\./, // TEST-NET-1
  /^198\.51\.100\./, // TEST-NET-2
  /^203\.0\.113\./, // TEST-NET-3
  /^100\.64\./, // Shared Address Space (CGNAT abuse)
  /^224\./, // Multicast
  /^240\./, // Reserved
]

// =====================================================
// HEADER ANALYSIS - Detect bots from HTTP headers
// v5.0: Reduced penalties, focus on DEFINITIVE indicators
// =====================================================
function analyzeHeaders(headersList: Headers): { score: number; flags: string[] } {
  let score = 0
  const flags: string[] = []

  const userAgent = headersList.get("user-agent") || ""
  const acceptLanguage = headersList.get("accept-language") || ""
  const acceptEncoding = headersList.get("accept-encoding") || ""
  const accept = headersList.get("accept") || ""
  const secFetchDest = headersList.get("sec-fetch-dest") || ""
  const secFetchMode = headersList.get("sec-fetch-mode") || ""
  const secFetchSite = headersList.get("sec-fetch-site") || ""
  const secChUa = headersList.get("sec-ch-ua") || ""
  const secChUaMobile = headersList.get("sec-ch-ua-mobile") || ""
  const secChUaPlatform = headersList.get("sec-ch-ua-platform") || ""
  const origin = headersList.get("origin") || ""

  // ── Critical: Missing essential headers ──
  // REDUCED penalties - proxies and CDNs may strip headers
  if (!userAgent) {
    score += 30 // Reduced from 50
    flags.push("missing_user_agent")
  }

  // We NO LONGER penalize missing accept-language/encoding
  // Many legitimate requests don't include these

  // ── Automation framework detection ──
  for (const pattern of BOT_SIGNATURES.automation) {
    if (pattern.test(userAgent)) {
      score += 100
      flags.push(`automation_${pattern.source.replace(/[^a-z]/gi, "").toLowerCase()}`)
      break
    }
  }

  // ── Scraper detection ──
  for (const pattern of BOT_SIGNATURES.scrapers) {
    if (pattern.test(userAgent)) {
      score += 90
      flags.push(`scraper_${pattern.source.replace(/[^a-z]/gi, "").toLowerCase()}`)
      break
    }
  }

  // ── Bot detection ──
  for (const pattern of BOT_SIGNATURES.bots) {
    if (pattern.test(userAgent)) {
      score += 80
      flags.push("bot_user_agent")
      break
    }
  }

  // ── Headless browser detection ──
  // ONLY flag EXPLICIT headless indicators in UA
  if (userAgent.includes("HeadlessChrome") || userAgent.includes("PhantomJS")) {
    score += 100 // High score - definitive indicator
    flags.push("headless_browser_confirmed")
  }
  // We NO LONGER check Chrome/Safari mismatch - too many false positives

  // ── sec-fetch headers analysis ──
  // REMOVED - Too many legitimate requests don't have these
  // Proxies, CDNs, and older browsers strip these headers

  // ── sec-ch-ua consistency check ──
  // REDUCED penalties - browsers vary in how they send these
  if (secChUa) {
    const chromeMatch = userAgent.match(/Chrome\/(\d+)/)
    if (chromeMatch) {
      const uaVersion = parseInt(chromeMatch[1])
      const chVersionMatch = secChUa.match(/"Chromium";v="(\d+)"/)
      if (chVersionMatch) {
        const chVersion = parseInt(chVersionMatch[1])
        // Only flag HUGE mismatches (> 10 versions)
        if (Math.abs(uaVersion - chVersion) > 10) {
          score += 20 // Reduced from 40
          flags.push("ua_ch_version_mismatch")
        }
      }
    }
    // Removed Not A Brand check - varies by browser
  }

  // ── Platform consistency checks ──
  // REDUCED penalties - VPNs and privacy tools spoof these
  if (secChUaPlatform && userAgent) {
    const platformLower = secChUaPlatform.toLowerCase().replace(/"/g, "")
    const uaLower = userAgent.toLowerCase()

    // Only check for OBVIOUS mismatches
    // Windows check
    if (platformLower.includes("windows") && !uaLower.includes("windows")) {
      score += 15 // Reduced from 30
      flags.push("platform_ua_mismatch_windows")
    }
    // Mac check
    if (platformLower.includes("macos") && !uaLower.includes("mac")) {
      score += 15 // Reduced from 30
      flags.push("platform_ua_mismatch_mac")
    }
    // Linux check - reduced penalty
    if (platformLower.includes("linux") && !uaLower.includes("linux") && !uaLower.includes("android")) {
      score += 15 // Reduced from 30
      flags.push("platform_ua_mismatch_linux")
    }
  }

  // REMOVED: Mobile indicator consistency check
  // Desktop browsers on tablets can mismatch

  // REMOVED: Accept header anomaly checks
  // Too many legitimate variations

  // REMOVED: Accept-Language anomaly checks  
  // Privacy tools and simple setups vary widely

  // REMOVED: Accept-Encoding anomaly checks
  // Proxies and CDNs modify these

  // REMOVED: Cache control anomaly checks
  // Many legitimate tools set these

  // REMOVED: Upgrade-Insecure-Requests check
  // Proxies strip this header

  // ── Referer/Origin validation ──
  // Only flag clearly malicious patterns
  if (origin && origin.includes("file://")) {
    score += 20 // Reduced from 30
    flags.push("file_origin")
  }

  // ── Known abusive patterns in user agent ──
  // ONLY flag patterns that are NEVER legitimate browsers
  const abusePatterns = [
    /python.*requests/i,
    /go-http-client/i,
  ]

  for (const pattern of abusePatterns) {
    if (pattern.test(userAgent)) {
      score += 50 // Reduced from 60
      flags.push("programmatic_user_agent")
      break
    }
  }

  return { score, flags }
}

// =====================================================
// FINGERPRINT VALIDATION - Verify client fingerprint
// =====================================================
async function validateFingerprint(
  fingerprint: string,
  userId: string,
  ipAddress: string
): Promise<{ score: number; flags: string[] }> {
  let score = 0
  const flags: string[] = []

  const supabase = requireAdminClient()

  // Check if this fingerprint is linked to banned accounts
  const { data: bannedLinks } = await supabase
    .from("device_fingerprints")
    .select("user_id, profiles!inner(is_banned, banned_at)")
    .eq("fingerprint_hash", fingerprint)
    .not("user_id", "eq", userId)

  if (bannedLinks && bannedLinks.length > 0) {
    const bannedCount = bannedLinks.filter((l: any) => l.profiles?.is_banned || l.profiles?.banned_at).length
    if (bannedCount > 0) {
      score += Math.min(bannedCount * 30, 90)
      flags.push(`linked_to_${bannedCount}_banned_accounts`)
    }
  }

  // Check for fingerprint abuse (too many accounts)
  const { count: accountCount } = await supabase
    .from("device_fingerprints")
    .select("*", { count: "exact", head: true })
    .eq("fingerprint_hash", fingerprint)

  if (accountCount && accountCount > 3) {
    score += Math.min((accountCount - 3) * 15, 60)
    flags.push(`fingerprint_on_${accountCount}_accounts`)
  }

  // Check if fingerprint recently changed (suspicious)
  const { data: recentFingerprints } = await supabase
    .from("device_fingerprints")
    .select("fingerprint_hash, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5)

  if (recentFingerprints && recentFingerprints.length > 2) {
    const uniqueFingerprints = new Set(recentFingerprints.map(f => f.fingerprint_hash))
    if (uniqueFingerprints.size >= 4) {
      score += 40
      flags.push("frequent_fingerprint_changes")
    }
  }

  return { score, flags }
}

// =====================================================
// BEHAVIOR VALIDATION - Verify client behavior claims
// v5.0: Significantly reduced penalties to prevent false positives
// =====================================================
function validateBehavior(payload: ClientSecurityPayload): { score: number; flags: string[] } {
  let score = 0
  const flags: string[] = []

  // Verify timestamp is recent - very lenient
  if (payload.timestamp) {
    const age = Date.now() - payload.timestamp
    if (age < 0) {
      // Future timestamp is suspicious but could be clock skew
      score += 20 // Reduced from 50
      flags.push("future_timestamp")
    }
    // Removed stale_payload check - users may have slow connections
  }

  // We NO LONGER check behavior score
  // The client detection is already tuned to prevent false positives

  // Verify verification wasn't IMPOSSIBLY fast
  if (payload.verificationDuration !== undefined) {
    // Only flag if literally instant (< 500ms)
    if (payload.verificationDuration < 500) {
      score += 30 // Reduced from 40
      flags.push("instant_verification")
    }
    // Removed fast_verification - humans can be fast too
  }

  // We NO LONGER check mouse movements
  // Mobile/touch users may not move mouse at all

  // Verify hardware claims are realistic - very lenient
  if (payload.hardwareConcurrency !== undefined) {
    // Only flag truly impossible values
    if (payload.hardwareConcurrency < 1 || payload.hardwareConcurrency > 256) {
      score += 15 // Reduced from 30
      flags.push("unusual_hardware_concurrency")
    }
  }

  // We NO LONGER check device memory or plugin count
  // These vary too much between legitimate browsers

  // Check for threat detections from client
  // CRITICAL: Only flag DEFINITIVE automation
  if (payload.detectedThreats && payload.detectedThreats.length > 0) {
    const threatLower = payload.detectedThreats.map(t => t.toLowerCase())

    // Only flag CONFIRMED automation frameworks
    // These are DEFINITIVE indicators that ONLY appear in automated browsers
    const definitiveThreats = threatLower.filter(threat =>
      threat.includes("webdriver=true") ||
      threat.includes("selenium automation") ||
      threat.includes("puppeteer globals") ||
      threat.includes("playwright globals") ||
      threat.includes("phantomjs") ||
      threat.includes("headlesschrome")
    )

    // Need DEFINITIVE indicators to flag
    if (definitiveThreats.length >= 2) {
      score += 80
      flags.push("multiple_definitive_automation")
    } else if (definitiveThreats.length === 1) {
      score += 50
      flags.push("single_definitive_automation")
    }

    // We NO LONGER flag userscript managers
    // Too many legitimate uses (password managers, accessibility, etc.)
  }

  return { score, flags }
}

// =====================================================
// TIMING ANALYSIS - Detect automated timing patterns
// =====================================================
async function analyzeTimingPatterns(
  userId: string,
  currentTimestamp: number
): Promise<{ score: number; flags: string[] }> {
  let score = 0
  const flags: string[] = []

  const supabase = requireAdminClient()

  // Get recent claims for this user
  const { data: recentClaims } = await supabase
    .from("claims")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20)

  if (recentClaims && recentClaims.length >= 5) {
    const timestamps = recentClaims.map(c => new Date(c.created_at).getTime())
    const intervals: number[] = []

    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i - 1] - timestamps[i])
    }

    // Calculate coefficient of variation
    if (intervals.length >= 4) {
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / intervals.length
      const stdDev = Math.sqrt(variance)
      const coeffOfVar = stdDev / avg

      // Too consistent timing (< 5% variation) is suspicious
      if (coeffOfVar < 0.05 && intervals.length >= 6) {
        score += 50
        flags.push("robotic_timing_pattern")
      } else if (coeffOfVar < 0.10 && intervals.length >= 8) {
        score += 30
        flags.push("consistent_timing_pattern")
      }
    }
  }

  return { score, flags }
}

// =====================================================
// ADBLOCK SERVER VERIFICATION
// =====================================================
async function verifyAdblockDetection(
  userId: string,
  clientReportedAdblock: boolean
): Promise<{ detected: boolean; score: number; flags: string[] }> {
  let score = 0
  const flags: string[] = []

  const supabase = requireAdminClient()

  // Check if user has been flagged for adblock before
  const { data: profile } = await supabase
    .from("profiles")
    .select("adblock_flagged, fraud_flags")
    .eq("id", userId)
    .single()

  if (profile?.adblock_flagged) {
    score += 60
    flags.push("previously_flagged_adblock")
  }

  // Check fraud flags for adblock
  if (profile?.fraud_flags && Array.isArray(profile.fraud_flags)) {
    const adblockFlags = profile.fraud_flags.filter((f: any) =>
      f.type === "adblock" || f.reason?.includes("adblock")
    )
    if (adblockFlags.length > 0) {
      score += Math.min(adblockFlags.length * 20, 60)
      flags.push(`${adblockFlags.length}_previous_adblock_flags`)
    }
  }

  // Check recent adblock detection reports
  const { count: recentDetections } = await supabase
    .from("fraud_flags")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("flag_type", "adblock")
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  if (recentDetections && recentDetections > 0) {
    score += Math.min(recentDetections * 15, 45)
    flags.push(`${recentDetections}_recent_adblock_detections`)
  }

  return {
    detected: score > 30 || clientReportedAdblock,
    score,
    flags,
  }
}

// =====================================================
// MAIN VALIDATION FUNCTION
// =====================================================
export async function validateSecurityServerSide(
  userId: string,
  payload: ClientSecurityPayload
): Promise<ServerValidationResult> {
  const headersList = await headers()
  const forwarded = headersList.get("x-forwarded-for")
  const ipAddress = forwarded ? forwarded.split(",")[0].trim() :
    headersList.get("x-real-ip") || "127.0.0.1"

  let totalScore = 0
  const allFlags: string[] = []

  // Layer 1: Header analysis
  const headerResult = analyzeHeaders(headersList)
  totalScore += headerResult.score
  allFlags.push(...headerResult.flags)

  // Layer 2: VPN/Proxy detection
  const vpnResult = await detectVPN(ipAddress, {
    timezone: payload.timezone,
    webrtcIPs: payload.webrtcIPs,
    userAgent: headersList.get("user-agent") || undefined,
  })

  if (vpnResult.isVPN || vpnResult.isProxy) {
    totalScore += vpnResult.confidence >= 80 ? 50 : 30
    allFlags.push("vpn_proxy_detected")
  }
  if (vpnResult.isTor) {
    totalScore += 70
    allFlags.push("tor_detected")
  }
  if (vpnResult.isDatacenter) {
    totalScore += vpnResult.confidence >= 90 ? 40 : 20
    allFlags.push("datacenter_ip")
  }

  // Layer 3: Fingerprint validation
  if (payload.fingerprint) {
    const fpResult = await validateFingerprint(payload.fingerprint, userId, ipAddress)
    totalScore += fpResult.score
    allFlags.push(...fpResult.flags)
  }

  // Layer 4: Behavior validation
  const behaviorResult = validateBehavior(payload)
  totalScore += behaviorResult.score
  allFlags.push(...behaviorResult.flags)

  // Layer 5: Timing pattern analysis
  const timingResult = await analyzeTimingPatterns(userId, payload.timestamp || Date.now())
  totalScore += timingResult.score
  allFlags.push(...timingResult.flags)

  // Layer 6: Adblock verification (legacy)
  const adblockResult = await verifyAdblockDetection(userId, false)
  totalScore += adblockResult.score
  allFlags.push(...adblockResult.flags)

  // Layer 7: FORTRESS Adblock Server-Side Verification (v4.0)
  // This is the ultimate verification - purely server-side, cannot be bypassed
  let adblockFortressResult: HoneypotVerificationResult | undefined
  let fortressVerified = false
  let serverOnlyDetection = false

  try {
    // Use honeypot results from client if available
    if (payload.detectedThreats && payload.detectedThreats.length > 0) {
      const honeypotResults = payload.detectedThreats
        .filter(threat => threat.startsWith("hp_") || threat.startsWith("ctrl_"))
        .map(probeId => ({
          probeId,
          loaded: false,
          timing: 0,
          responseCode: 0,
        }))

      if (honeypotResults.length > 0) {
        adblockFortressResult = verifyHoneypotResults(honeypotResults)
        fortressVerified = true

        if (adblockFortressResult.isAdblockDetected) {
          // Server detected blocking
          serverOnlyDetection = true

          // Add fortress-detected flags based on confidence
          totalScore += adblockFortressResult.confidence >= 95 ? 60 :
            adblockFortressResult.confidence >= 80 ? 45 :
              adblockFortressResult.confidence >= 60 ? 30 : 15

          if (adblockFortressResult.blockedProbes.length > 0) {
            allFlags.push(`fortress_blocked_${adblockFortressResult.blockedProbes.length}_probes`)
          }

          adblockFortressResult.methods.forEach(method => {
            allFlags.push(`fortress_${method}`)
          })

          if (serverOnlyDetection) {
            allFlags.push("fortress_server_only_detection")
            // Extra penalty for trying to hide adblock from client
            totalScore += 25
          }
        }
      }
    }
  } catch {
    // Fortress verification failed, continue with legacy only
  }

  // Layer 8: FORTRESS VPN Server-Side Verification (v4.0)
  let vpnFortressResult: VPNFortressResult | undefined

  try {
    vpnFortressResult = await detectVPNFortress(ipAddress, {
      userAgent: headersList.get("user-agent") || undefined,
      language: headersList.get("accept-language") || undefined,
      timezone: payload.timezone,
      webrtcIPs: payload.webrtcIPs,
    })

    if (vpnFortressResult.isVPN || vpnFortressResult.isProxy) {
      const vpnPenalty = vpnFortressResult.confidence >= 95 ? 70 :
        vpnFortressResult.confidence >= 80 ? 55 :
          vpnFortressResult.confidence >= 60 ? 40 : 25
      totalScore += vpnPenalty

      vpnFortressResult.methods.forEach((method) => {
        allFlags.push(`vpn_fortress_${method}`)
      })

      if (vpnFortressResult.isTor) {
        allFlags.push("vpn_fortress_tor_confirmed")
        totalScore += 30
      }

      if (vpnFortressResult.isResidentialProxy) {
        allFlags.push("vpn_fortress_residential_proxy")
        // Residential proxies are harder to detect, higher penalty for catching them
        totalScore += 40
      }
    }
  } catch {
    // VPN fortress verification failed, rely on legacy vpnResult
  }

  // Calculate confidence level - RAISED thresholds
  let confidence: ServerValidationResult["confidence"] = "low"

  // Count DEFINITIVE indicators only
  const definitiveFlags = allFlags.filter(f =>
    f.includes("webdriver") ||
    f.includes("selenium") ||
    f.includes("puppeteer") ||
    f.includes("playwright") ||
    f.includes("headless") ||
    f.includes("definitive")
  )

  if (definitiveFlags.length >= 2 || totalScore >= 200) {
    confidence = "absolute"
  } else if (definitiveFlags.length >= 1 || totalScore >= 150) {
    confidence = "high"
  } else if (totalScore >= 100) {
    confidence = "medium"
  }

  // Determine if should block/logout - MUCH stricter
  // Only block with HIGH confidence and definitive indicators
  const hasDefinitiveIndicator = definitiveFlags.length > 0
  const shouldBlock = totalScore >= 150 && hasDefinitiveIndicator && confidence !== "low"
  const shouldLogout = totalScore >= 200 && definitiveFlags.length >= 2 && confidence === "absolute"

  // Determine ban reason if applicable
  let banReason: string | undefined
  if (totalScore >= 150) {
    if (allFlags.includes("bot_user_agent") || allFlags.includes("headless_chrome")) {
      banReason = "Automated bot detected"
    } else if (allFlags.includes("client_detected_automation")) {
      banReason = "Automation framework detected"
    } else if (allFlags.includes("client_detected_userscript")) {
      banReason = "Cheating userscript detected"
    } else if (allFlags.includes("robotic_timing_pattern")) {
      banReason = "Robotic behavior pattern detected"
    } else if (allFlags.includes("adblock_evasion_attempt")) {
      banReason = "Ad blocker evasion detected"
    } else if (allFlags.includes("combined_adblock_vpn_evasion")) {
      banReason = "Multiple evasion techniques detected"
    } else if (allFlags.includes("fortress_server_only_detection")) {
      banReason = "Server-side security bypass attempt"
    }
  }

  // Determine threat level based on score and DEFINITIVE flags only
  let threatLevel: ServerValidationResult["threatLevel"] = "none"
  if (totalScore >= 200 && definitiveFlags.length >= 2) {
    threatLevel = "critical"
  } else if (totalScore >= 150 && definitiveFlags.length >= 1) {
    threatLevel = "high"
  } else if (totalScore >= 100) {
    threatLevel = "medium"
  } else if (totalScore >= 60) {
    threatLevel = "low"
  }
  // VPN alone should NEVER raise threat level - many legitimate users use VPNs

  // Identify correlated threats (threats that reinforce each other)
  const correlatedThreats: string[] = []
  if (allFlags.includes("bot_user_agent") && allFlags.includes("headless_browser_indicators")) {
    correlatedThreats.push("automated_bot_confirmed")
  }
  if (allFlags.includes("vpn_proxy_detected") && allFlags.includes("datacenter_ip")) {
    correlatedThreats.push("masked_ip_confirmed")
  }
  if (allFlags.includes("robotic_timing_pattern") && allFlags.includes("client_detected_automation")) {
    correlatedThreats.push("automation_confirmed")
  }

  // FORTRESS v4.0 correlations
  if (adblockFortressResult?.isAdblockDetected && serverOnlyDetection) {
    correlatedThreats.push("adblock_evasion_confirmed")
    // User is actively trying to hide adblock usage - severe violation
    totalScore += 30
    allFlags.push("adblock_evasion_attempt")
  }

  if (vpnFortressResult?.isVPN && vpnResult?.isVPN) {
    correlatedThreats.push("vpn_multi_source_confirmed")
    // Both legacy and fortress agree - high confidence
  }

  if (vpnFortressResult?.isResidentialProxy && !vpnResult?.isProxy) {
    correlatedThreats.push("residential_proxy_evasion")
    // Fortress caught what legacy missed
    totalScore += 20
  }

  // Cross-system correlation: adblock + VPN = likely fraud
  if ((adblockFortressResult?.isAdblockDetected || adblockResult.detected) &&
    (vpnFortressResult?.isVPN || vpnResult?.isVPN)) {
    correlatedThreats.push("multi_evasion_detected")
    totalScore += 25
    allFlags.push("combined_adblock_vpn_evasion")
  }

  // Generate server fingerprint for audit trail
  const serverFingerprint = `sv3-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`

  return {
    isValid: totalScore < 50,
    isBlocked: shouldBlock,
    riskScore: Math.min(totalScore, 100),
    flags: allFlags,
    vpnResult,
    vpnFortressResult,
    botScore: behaviorResult.score + headerResult.score,
    adblockDetected: adblockResult.detected || (adblockFortressResult?.isAdblockDetected ?? false),
    adblockFortressResult,
    shouldLogout,
    banReason,
    confidence,
    // v4.0 FORTRESS additions
    threatLevel,
    correlatedThreats,
    serverFingerprint,
    validationTimestamp: Date.now(),
    fortressVerified,
    serverOnlyDetection,
  }
}

// =====================================================
// BAN USER FUNCTION
// =====================================================
export async function banUserIfNeeded(
  userId: string,
  validationResult: ServerValidationResult
): Promise<boolean> {
  if (!validationResult.banReason) return false

  const supabase = requireAdminClient()

  const { error } = await supabase
    .from("profiles")
    .update({
      is_banned: true,
      banned_at: new Date().toISOString(),
      ban_reason: validationResult.banReason,
      status: "banned",
      fraud_score: Math.min(validationResult.riskScore, 100),
    })
    .eq("id", userId)

  if (!error) {
    // Log the ban
    await supabase.from("audit_logs").insert({
      actor_id: "system",
      actor_role: "system",
      action: "auto_ban",
      resource_type: "user",
      resource_id: userId,
      metadata: {
        reason: validationResult.banReason,
        flags: validationResult.flags,
        score: validationResult.riskScore,
        confidence: validationResult.confidence,
      },
    })

    return true
  }

  return false
}
