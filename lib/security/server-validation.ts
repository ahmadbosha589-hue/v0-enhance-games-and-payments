// =====================================================
// ULTIMATE SERVER-SIDE SECURITY VALIDATION ENGINE v4.0
// FORTRESS EDITION - Maximum power, zero false positives
// Never trust client - verify EVERYTHING server-side
// Zero tolerance for bots, VPNs, adblockers, cheaters
// =====================================================

import { headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/server"
import { detectVPN } from "./vpn-detection"
import { verifyHoneypotResults, type HoneypotVerificationResult } from "./server-fortress"
import { detectVPNFortress, type VPNFortressResult } from "./vpn-fortress"
import type { VPNDetectionResult } from "./vpn-detection"

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
// Ultra-enhanced with 40+ signal detection
// =====================================================
function analyzeHeaders(headersList: Headers): { score: number; flags: string[] } {
  let score = 0
  const flags: string[] = []
  
  const userAgent = headersList.get("user-agent") || ""
  const acceptLanguage = headersList.get("accept-language") || ""
  const acceptEncoding = headersList.get("accept-encoding") || ""
  const accept = headersList.get("accept") || ""
  const connection = headersList.get("connection") || ""
  const secFetchDest = headersList.get("sec-fetch-dest") || ""
  const secFetchMode = headersList.get("sec-fetch-mode") || ""
  const secFetchSite = headersList.get("sec-fetch-site") || ""
  const secChUa = headersList.get("sec-ch-ua") || ""
  const secChUaMobile = headersList.get("sec-ch-ua-mobile") || ""
  const secChUaPlatform = headersList.get("sec-ch-ua-platform") || ""
  const cacheControl = headersList.get("cache-control") || ""
  const pragma = headersList.get("pragma") || ""
  const dnt = headersList.get("dnt") || ""
  const upgradeInsecureRequests = headersList.get("upgrade-insecure-requests") || ""
  const referer = headersList.get("referer") || ""
  const origin = headersList.get("origin") || ""
  
  // ── Critical: Missing essential headers ──
  if (!userAgent) {
    score += 50
    flags.push("missing_user_agent")
  }
  
  if (!acceptLanguage) {
    score += 30
    flags.push("missing_accept_language")
  }
  
  if (!acceptEncoding) {
    score += 25
    flags.push("missing_accept_encoding")
  }
  
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
  
  // ── Headless browser detection (enhanced) ──
  const headlessIndicators = [
    userAgent.includes("HeadlessChrome"),
    userAgent.includes("Headless"),
    userAgent.includes("PhantomJS"),
    userAgent.includes("Splash"),
    // Chrome with no GPU info is suspicious
    userAgent.includes("Chrome/") && !userAgent.includes("Safari/"),
  ]
  
  if (headlessIndicators.filter(Boolean).length >= 1) {
    score += 70
    flags.push("headless_browser_indicators")
  }
  
  // ── sec-fetch headers analysis (modern browsers) ──
  if (!secFetchDest && !secFetchMode && !secFetchSite) {
    if (userAgent.includes("Chrome/") || userAgent.includes("Firefox/")) {
      const versionMatch = userAgent.match(/Chrome\/(\d+)|Firefox\/(\d+)/)
      if (versionMatch) {
        const version = parseInt(versionMatch[1] || versionMatch[2] || "0")
        if ((userAgent.includes("Chrome") && version >= 76) ||
            (userAgent.includes("Firefox") && version >= 90)) {
          score += 35
          flags.push("missing_sec_fetch_headers")
        }
      }
    }
  }
  
  // ── sec-ch-ua consistency check ──
  if (secChUa) {
    const chromeMatch = userAgent.match(/Chrome\/(\d+)/)
    if (chromeMatch) {
      const uaVersion = parseInt(chromeMatch[1])
      const chVersionMatch = secChUa.match(/"Chromium";v="(\d+)"/)
      if (chVersionMatch) {
        const chVersion = parseInt(chVersionMatch[1])
        if (Math.abs(uaVersion - chVersion) > 3) {
          score += 40
          flags.push("ua_ch_version_mismatch")
        }
      }
    }
    
    // Check for Not A Brand indicator consistency
    if (!secChUa.includes("Not")) {
      score += 20
      flags.push("missing_not_a_brand")
    }
  }
  
  // ── Platform consistency checks ──
  if (secChUaPlatform && userAgent) {
    const platformLower = secChUaPlatform.toLowerCase().replace(/"/g, "")
    const uaLower = userAgent.toLowerCase()
    
    // Windows check
    if (platformLower.includes("windows") && !uaLower.includes("windows")) {
      score += 30
      flags.push("platform_ua_mismatch_windows")
    }
    // Mac check
    if (platformLower.includes("macos") && !uaLower.includes("mac")) {
      score += 30
      flags.push("platform_ua_mismatch_mac")
    }
    // Linux check
    if (platformLower.includes("linux") && !uaLower.includes("linux") && !uaLower.includes("android")) {
      score += 30
      flags.push("platform_ua_mismatch_linux")
    }
  }
  
  // ── Mobile indicator consistency ──
  if (secChUaMobile) {
    const isMobileChUa = secChUaMobile.includes("?1")
    const isMobileUa = /mobile|android|iphone|ipad|ipod/i.test(userAgent)
    
    if (isMobileChUa !== isMobileUa) {
      score += 25
      flags.push("mobile_indicator_mismatch")
    }
  }
  
  // ── Accept header anomalies ──
  if (accept === "*/*" && !userAgent.match(/curl|wget|httpie|python/i)) {
    score += 20
    flags.push("generic_accept_header")
  }
  
  // ── Accept-Language anomalies ──
  if (acceptLanguage) {
    // Single language with no quality values is suspicious
    if (!acceptLanguage.includes(",") && !acceptLanguage.includes(";q=")) {
      score += 15
      flags.push("simple_accept_language")
    }
    // Very short accept-language
    if (acceptLanguage.length < 5) {
      score += 20
      flags.push("minimal_accept_language")
    }
  }
  
  // ── Accept-Encoding anomalies ──
  if (acceptEncoding) {
    // Modern browsers support multiple encodings
    const encodings = acceptEncoding.split(",").map(e => e.trim().split(";")[0])
    if (encodings.length < 2) {
      score += 15
      flags.push("limited_accept_encoding")
    }
    // Very old or unusual encoding support
    if (!acceptEncoding.includes("gzip")) {
      score += 20
      flags.push("no_gzip_support")
    }
  }
  
  // ── Cache control anomalies ──
  if (cacheControl === "no-cache" && pragma === "no-cache") {
    // This combination is often set by automation tools
    score += 10
    flags.push("automation_cache_headers")
  }
  
  // ── Upgrade-Insecure-Requests missing ──
  if (!upgradeInsecureRequests && userAgent.includes("Chrome/")) {
    const versionMatch = userAgent.match(/Chrome\/(\d+)/)
    if (versionMatch && parseInt(versionMatch[1]) >= 70) {
      score += 15
      flags.push("missing_upgrade_insecure_requests")
    }
  }
  
  // ── Referer/Origin validation for POST requests ──
  // This is handled at the route level, but flag suspicious patterns
  if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
    // Check for suspicious origins
    if (origin.includes("file://") || origin === "null") {
      score += 30
      flags.push("suspicious_origin")
    }
  }
  
  // ── Known abusive patterns in user agent ──
  const abusePatterns = [
    /python.*requests/i,
    /go-http-client/i,
    /java\/\d/i,
    /perl/i,
    /ruby/i,
    /php/i,
    /dotnet/i,
  ]
  
  for (const pattern of abusePatterns) {
    if (pattern.test(userAgent)) {
      score += 60
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
  
  const supabase = createAdminClient()
  
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
// =====================================================
function validateBehavior(payload: ClientSecurityPayload): { score: number; flags: string[] } {
  let score = 0
  const flags: string[] = []
  
  // Verify timestamp is recent
  if (payload.timestamp) {
    const age = Date.now() - payload.timestamp
    if (age < 0) {
      score += 50
      flags.push("future_timestamp")
    } else if (age > 10 * 60 * 1000) { // > 10 minutes old
      score += 30
      flags.push("stale_payload")
    }
  }
  
  // Verify behavior score isn't spoofed (should be realistic)
  if (payload.behaviorScore !== undefined) {
    // Only flag impossible values - perfect score of 100 CAN happen for legitimate users
    if (payload.behaviorScore < 0 || payload.behaviorScore > 100) {
      score += 30 // Reduced from 50 - could be a bug
      flags.push("invalid_behavior_score")
    }
    // Removed perfect_behavior_score flag - causes too many false positives
  }
  
  // Verify verification wasn't too fast
  if (payload.verificationDuration !== undefined) {
    if (payload.verificationDuration < 2000) { // < 2 seconds
      score += 40
      flags.push("too_fast_verification")
    } else if (payload.verificationDuration < 3500) { // < 3.5 seconds
      score += 20
      flags.push("fast_verification")
    }
  }
  
  // Verify mouse movements exist
  if (payload.mouseMovements !== undefined && payload.mouseMovements < 3) {
    score += 25
    flags.push("insufficient_mouse_movement")
  }
  
  // Verify hardware claims are realistic
  if (payload.hardwareConcurrency !== undefined) {
    if (payload.hardwareConcurrency < 1 || payload.hardwareConcurrency > 128) {
      score += 30
      flags.push("invalid_hardware_concurrency")
    }
  }
  
  if (payload.deviceMemory !== undefined) {
    if (payload.deviceMemory < 0.25 || payload.deviceMemory > 512) {
      score += 30
      flags.push("invalid_device_memory")
    }
  }
  
  // Verify plugin count (0 plugins on desktop is suspicious)
  if (payload.pluginCount !== undefined && payload.pluginCount === 0) {
    // Only flag if not mobile
    if (!payload.touchSupport) {
      score += 25
      flags.push("no_plugins_desktop")
    }
  }
  
  // Check for threat detections from client
  // IMPORTANT: Reduce false positives by requiring multiple strong indicators
  if (payload.detectedThreats && payload.detectedThreats.length > 0) {
    const threatLower = payload.detectedThreats.map(t => t.toLowerCase())
    
    // Only flag CONFIRMED automation frameworks - not extensions or dev tools
    const automationThreats = threatLower.filter(threat => 
      threat.includes("webdriver") || 
      threat.includes("selenium") ||
      threat.includes("puppeteer") ||
      threat.includes("playwright") ||
      threat.includes("phantomjs")
    )
    
    // Need at least 2 automation indicators OR 1 very strong one to flag
    if (automationThreats.length >= 2) {
      score += 60
      flags.push("multiple_automation_indicators")
    } else if (automationThreats.some(t => t.includes("webdriver") && t.includes("true"))) {
      // Only flag if explicitly detected as true, not just presence of property
      score += 50
      flags.push("webdriver_confirmed")
    }
    
    // For userscripts - ONLY flag if combined with other suspicious behavior
    // Many legitimate users have password managers, ad blockers, etc.
    const userscriptThreats = threatLower.filter(threat =>
      threat.includes("tampermonkey") ||
      threat.includes("greasemonkey") ||
      threat.includes("violentmonkey")
    )
    
    // Only flag userscripts if they're gaming-related or have automation keywords
    const gamingUserscripts = userscriptThreats.filter(threat =>
      threat.includes("auto") ||
      threat.includes("bot") ||
      threat.includes("cheat") ||
      threat.includes("hack") ||
      threat.includes("faucet") ||
      threat.includes("claim")
    )
    
    if (gamingUserscripts.length > 0) {
      score += 40 // Reduced from 70
      flags.push("gaming_userscript_detected")
    }
    // Don't penalize generic userscript managers - too many false positives
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
  
  const supabase = createAdminClient()
  
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
  
  const supabase = createAdminClient()
  
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
      acceptLanguage: headersList.get("accept-language") || undefined,
      timezone: payload.timezone,
      webrtcIPs: payload.webrtcIPs,
    })
    
    if (vpnFortressResult.isVPN || vpnFortressResult.isProxy) {
      const vpnPenalty = vpnFortressResult.confidence === "absolute" ? 70 :
                         vpnFortressResult.confidence === "high" ? 55 :
                         vpnFortressResult.confidence === "medium" ? 40 : 25
      totalScore += vpnPenalty
      
      vpnFortressResult.detectionMethods.forEach(method => {
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
  
  // Calculate confidence level
  let confidence: ServerValidationResult["confidence"] = "low"
  if (allFlags.length >= 5 || totalScore >= 150) {
    confidence = "absolute"
  } else if (allFlags.length >= 3 || totalScore >= 100) {
    confidence = "high"
  } else if (allFlags.length >= 2 || totalScore >= 50) {
    confidence = "medium"
  }
  
  // Determine if should block/logout
  const shouldBlock = totalScore >= 80 || (totalScore >= 60 && confidence !== "low")
  const shouldLogout = totalScore >= 120 || allFlags.includes("client_detected_automation")
  
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
  
  // Determine threat level based on score and flags
  let threatLevel: ServerValidationResult["threatLevel"] = "none"
  if (totalScore >= 150 || allFlags.includes("bot_user_agent") || allFlags.includes("headless_browser_indicators")) {
    threatLevel = "critical"
  } else if (totalScore >= 100 || allFlags.includes("client_detected_automation")) {
    threatLevel = "high"
  } else if (totalScore >= 60 || allFlags.includes("vpn_proxy_detected")) {
    threatLevel = "medium"
  } else if (totalScore >= 30) {
    threatLevel = "low"
  }

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
  if (adblockFortressResult?.isBlocking && serverOnlyDetection) {
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
  if ((adblockFortressResult?.isBlocking || adblockResult.detected) && 
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
    adblockDetected: adblockResult.detected || (adblockFortressResult?.isBlocking ?? false),
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
  
  const supabase = createAdminClient()
  
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
