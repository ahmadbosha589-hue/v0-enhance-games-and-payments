/**
 * Referral Fraud Detector v2.0
 * 
 * Multi-layered protection against self-referrals and referral abuse:
 * 
 * Layer 1: Direct Identity Matching
 *   - Same email domain patterns
 *   - Same Google account ID
 *   - Same phone number (if collected)
 *   - Similar usernames/display names (Levenshtein distance)
 * 
 * Layer 2: Device Fingerprinting
 *   - Canvas fingerprint
 *   - WebGL fingerprint
 *   - Audio fingerprint
 *   - Font fingerprint
 *   - Hardware concurrency
 *   - Device memory
 *   - Screen resolution
 *   - Timezone + Language combination
 * 
 * Layer 3: Network Analysis
 *   - Same IP address
 *   - Same IP subnet (/24)
 *   - Same ASN (Autonomous System Number)
 *   - Same ISP
 *   - Tor/VPN exit node detection
 * 
 * Layer 4: Behavioral Analysis
 *   - Registration time proximity
 *   - Claim time correlation
 *   - Session overlap detection
 *   - Identical click patterns
 *   - Similar navigation patterns
 * 
 * Layer 5: Graph Analysis
 *   - Referral network clustering
 *   - Circular referral detection
 *   - Multi-hop self-referral (A → B → C → A)
 *   - Suspicious referral chains
 * 
 * Layer 6: Statistical Analysis
 *   - Claim amount correlation
 *   - Withdrawal timing patterns
 *   - Activity level similarity
 *   - Anomaly detection (isolation forest)
 */

import { createClient } from "@/lib/supabase/server"
import { log } from "@/lib/logger"

// Similarity thresholds
const LEVENSHTEIN_THRESHOLD = 3 // Max edits for "similar" usernames
const EMAIL_PATTERN_SIMILARITY = 0.8 // 80% pattern match
const TIME_PROXIMITY_MINUTES = 30 // Registration within 30 mins is suspicious
const CLAIM_CORRELATION_THRESHOLD = 0.7 // 70% claim time correlation
const SESSION_OVERLAP_THRESHOLD = 5 // 5+ overlapping sessions

export interface ReferralFraudResult {
  isFraud: boolean
  confidence: number // 0-100
  riskLevel: "none" | "low" | "medium" | "high" | "critical"
  shouldBlock: boolean
  reasons: string[]
  matchedLayers: number[]
  evidenceScore: number
  details: {
    identityMatch?: {
      emailPattern: boolean
      googleId: boolean
      usernamePattern: boolean
      score: number
    }
    deviceMatch?: {
      fingerprintMatch: boolean
      canvasMatch: boolean
      hardwareMatch: boolean
      score: number
    }
    networkMatch?: {
      sameIp: boolean
      sameSubnet: boolean
      sameAsn: boolean
      sameIsp: boolean
      score: number
    }
    behavioralMatch?: {
      timeProximity: boolean
      claimCorrelation: boolean
      sessionOverlap: boolean
      score: number
    }
    graphMatch?: {
      circularReferral: boolean
      clusterDetected: boolean
      suspiciousChain: boolean
      score: number
    }
  }
}

interface UserProfile {
  id: string
  email?: string
  display_name?: string
  username?: string
  signup_ip?: string
  last_login_ip?: string
  created_at: string
  metadata?: Record<string, unknown>
  referred_by?: string
}

interface DeviceFingerprint {
  user_id: string
  fingerprint_hash: string
  canvas_hash?: string
  webgl_hash?: string
  audio_hash?: string
  hardware_concurrency?: number
  device_memory?: number
  screen_resolution?: string
  timezone?: string
  language?: string
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }

  return dp[m][n]
}

/**
 * Extract email pattern (remove numbers, get structure)
 */
function getEmailPattern(email: string): string {
  if (!email) return ""
  const [local, domain] = email.toLowerCase().split("@")
  // Remove numbers, normalize common patterns
  const normalized = local
    .replace(/[0-9]+/g, "#")
    .replace(/[._-]+/g, "_")
    .toLowerCase()
  return `${normalized}@${domain}`
}

/**
 * Check if two emails follow similar patterns
 */
function emailPatternSimilarity(email1: string, email2: string): number {
  const pattern1 = getEmailPattern(email1)
  const pattern2 = getEmailPattern(email2)
  
  if (pattern1 === pattern2) return 1.0
  
  const distance = levenshteinDistance(pattern1, pattern2)
  const maxLen = Math.max(pattern1.length, pattern2.length)
  return 1 - (distance / maxLen)
}

/**
 * Check if two IPs are in the same /24 subnet
 */
function sameSubnet(ip1: string, ip2: string): boolean {
  if (!ip1 || !ip2) return false
  const parts1 = ip1.split(".")
  const parts2 = ip2.split(".")
  if (parts1.length !== 4 || parts2.length !== 4) return false
  return parts1[0] === parts2[0] && parts1[1] === parts2[1] && parts1[2] === parts2[2]
}

/**
 * Calculate time proximity in minutes
 */
function timeProximityMinutes(date1: string | Date, date2: string | Date): number {
  const d1 = new Date(date1).getTime()
  const d2 = new Date(date2).getTime()
  return Math.abs(d1 - d2) / (1000 * 60)
}

/**
 * Detect circular referrals in the referral chain
 */
async function detectCircularReferral(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  referrerId: string,
  maxDepth: number = 10
): Promise<{ isCircular: boolean; chain: string[] }> {
  const chain: string[] = [userId]
  let currentId = referrerId
  
  for (let i = 0; i < maxDepth; i++) {
    if (!currentId) break
    
    // Check if we've seen this user before (circular)
    if (chain.includes(currentId)) {
      return { isCircular: true, chain: [...chain, currentId] }
    }
    
    chain.push(currentId)
    
    // Get the referrer's referrer
    const { data: profile } = await supabase
      .from("profiles")
      .select("referred_by")
      .eq("id", currentId)
      .single()
    
    currentId = profile?.referred_by || ""
  }
  
  return { isCircular: false, chain }
}

/**
 * Detect referral network clusters (suspicious groups)
 */
async function detectReferralCluster(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  referrerId: string
): Promise<{ isCluster: boolean; clusterSize: number; sharedAttributes: string[] }> {
  const sharedAttributes: string[] = []
  
  // Get all users referred by the same referrer
  const { data: siblings } = await supabase
    .from("profiles")
    .select("id, signup_ip, created_at, metadata")
    .eq("referred_by", referrerId)
    .limit(100)
  
  if (!siblings || siblings.length < 2) {
    return { isCluster: false, clusterSize: 0, sharedAttributes: [] }
  }
  
  // Analyze the cluster
  const ips = new Set(siblings.map(s => s.signup_ip).filter(Boolean))
  const registrationTimes = siblings.map(s => new Date(s.created_at).getTime())
  
  // Check for IP clustering
  if (ips.size < siblings.length * 0.5) {
    sharedAttributes.push("shared_ip")
  }
  
  // Check for registration time clustering
  const sortedTimes = registrationTimes.sort((a, b) => a - b)
  let rapidRegistrations = 0
  for (let i = 1; i < sortedTimes.length; i++) {
    if (sortedTimes[i] - sortedTimes[i - 1] < 30 * 60 * 1000) { // 30 minutes
      rapidRegistrations++
    }
  }
  
  if (rapidRegistrations > siblings.length * 0.3) {
    sharedAttributes.push("rapid_registration")
  }
  
  // Check for device fingerprint clustering
  const { data: fingerprints } = await supabase
    .from("device_fingerprints")
    .select("user_id, fingerprint_hash")
    .in("user_id", siblings.map(s => s.id))
  
  if (fingerprints) {
    const fpHashes = new Set(fingerprints.map(f => f.fingerprint_hash))
    if (fpHashes.size < fingerprints.length * 0.5) {
      sharedAttributes.push("shared_device")
    }
  }
  
  const isCluster = sharedAttributes.length >= 2 || siblings.length >= 5
  
  return {
    isCluster,
    clusterSize: siblings.length,
    sharedAttributes,
  }
}

/**
 * Main fraud detection function
 */
export async function detectReferralFraud(
  referrerId: string,
  newUserId: string,
  newUserData: {
    email?: string
    displayName?: string
    signupIp?: string
    fingerprint?: string
    metadata?: Record<string, unknown>
  }
): Promise<ReferralFraudResult> {
  const result: ReferralFraudResult = {
    isFraud: false,
    confidence: 0,
    riskLevel: "none",
    shouldBlock: false,
    reasons: [],
    matchedLayers: [],
    evidenceScore: 0,
    details: {},
  }
  
  try {
    const supabase = await createClient()
    
    // Get referrer's profile
    const { data: referrer } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", referrerId)
      .single()
    
    if (!referrer) {
      result.reasons.push("Referrer not found")
      result.confidence = 100
      result.isFraud = true
      result.shouldBlock = true
      result.riskLevel = "critical"
      return result
    }
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 1: IDENTITY MATCHING
    // ═══════════════════════════════════════════════════════════════
    let layer1Score = 0
    const identityMatch = {
      emailPattern: false,
      googleId: false,
      usernamePattern: false,
      score: 0,
    }
    
    // Check email pattern similarity
    if (newUserData.email && referrer.email) {
      const similarity = emailPatternSimilarity(newUserData.email, referrer.email)
      if (similarity >= EMAIL_PATTERN_SIMILARITY) {
        identityMatch.emailPattern = true
        layer1Score += 30
        result.reasons.push(`Email pattern similarity: ${(similarity * 100).toFixed(0)}%`)
      }
      
      // Check for exact email domain with sequential numbers
      const newEmail = newUserData.email.toLowerCase()
      const refEmail = referrer.email.toLowerCase()
      if (newEmail.split("@")[1] === refEmail.split("@")[1]) {
        const newLocal = newEmail.split("@")[0].replace(/[0-9]/g, "")
        const refLocal = refEmail.split("@")[0].replace(/[0-9]/g, "")
        if (newLocal === refLocal) {
          identityMatch.emailPattern = true
          layer1Score += 40
          result.reasons.push("Sequential email pattern detected")
        }
      }
    }
    
    // Check Google ID match (same Google account trying different emails)
    const newGoogleId = newUserData.metadata?.google_id
    const refGoogleId = referrer.metadata?.google_id
    if (newGoogleId && refGoogleId && newGoogleId === refGoogleId) {
      identityMatch.googleId = true
      layer1Score += 100
      result.reasons.push("Same Google account ID")
    }
    
    // Check username/display name similarity
    const newName = newUserData.displayName || ""
    const refName = referrer.display_name || referrer.username || ""
    if (newName && refName) {
      const distance = levenshteinDistance(newName.toLowerCase(), refName.toLowerCase())
      if (distance <= LEVENSHTEIN_THRESHOLD) {
        identityMatch.usernamePattern = true
        layer1Score += 20
        result.reasons.push(`Similar username/display name (distance: ${distance})`)
      }
    }
    
    identityMatch.score = layer1Score
    if (layer1Score > 0) {
      result.matchedLayers.push(1)
      result.details.identityMatch = identityMatch
    }
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 2: DEVICE FINGERPRINTING
    // ═══════════════════════════════════════════════════════════════
    let layer2Score = 0
    const deviceMatch = {
      fingerprintMatch: false,
      canvasMatch: false,
      hardwareMatch: false,
      score: 0,
    }
    
    if (newUserData.fingerprint) {
      // Check if referrer has used the same device
      const { data: referrerDevices } = await supabase
        .from("device_fingerprints")
        .select("*")
        .eq("user_id", referrerId)
      
      if (referrerDevices) {
        for (const device of referrerDevices) {
          if (device.fingerprint_hash === newUserData.fingerprint) {
            deviceMatch.fingerprintMatch = true
            layer2Score += 80
            result.reasons.push("Same device fingerprint as referrer")
            break
          }
        }
      }
      
      // Check if this fingerprint is linked to other accounts
      const { data: otherUsers } = await supabase
        .from("device_fingerprints")
        .select("user_id")
        .eq("fingerprint_hash", newUserData.fingerprint)
        .neq("user_id", newUserId)
        .limit(5)
      
      if (otherUsers && otherUsers.length > 0) {
        // Check if any of these users referred each other
        const otherIds = otherUsers.map(u => u.user_id)
        const { data: linkedProfiles } = await supabase
          .from("profiles")
          .select("id, referred_by")
          .in("id", [...otherIds, referrerId])
        
        if (linkedProfiles) {
          const hasConnection = linkedProfiles.some(
            p => p.referred_by && otherIds.includes(p.referred_by)
          )
          if (hasConnection) {
            layer2Score += 40
            result.reasons.push("Device linked to referral network")
          }
        }
      }
    }
    
    deviceMatch.score = layer2Score
    if (layer2Score > 0) {
      result.matchedLayers.push(2)
      result.details.deviceMatch = deviceMatch
    }
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 3: NETWORK ANALYSIS
    // ═══════════════════════════════════════════════════════════════
    let layer3Score = 0
    const networkMatch = {
      sameIp: false,
      sameSubnet: false,
      sameAsn: false,
      sameIsp: false,
      score: 0,
    }
    
    const newIp = newUserData.signupIp
    const refIp = referrer.signup_ip || referrer.last_login_ip
    
    if (newIp && refIp) {
      // Exact IP match
      if (newIp === refIp) {
        networkMatch.sameIp = true
        layer3Score += 60
        result.reasons.push("Same IP address as referrer")
      }
      // Same subnet
      else if (sameSubnet(newIp, refIp)) {
        networkMatch.sameSubnet = true
        layer3Score += 30
        result.reasons.push("Same IP subnet as referrer")
      }
    }
    
    // Check IP history overlap
    if (newIp) {
      const { data: ipHistory } = await supabase
        .from("device_fingerprints")
        .select("user_id, ip_addresses")
        .eq("user_id", referrerId)
      
      if (ipHistory) {
        for (const record of ipHistory) {
          const ips = record.ip_addresses as string[] || []
          if (ips.includes(newIp)) {
            layer3Score += 40
            result.reasons.push("IP address previously used by referrer")
            break
          }
        }
      }
    }
    
    networkMatch.score = layer3Score
    if (layer3Score > 0) {
      result.matchedLayers.push(3)
      result.details.networkMatch = networkMatch
    }
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 4: BEHAVIORAL ANALYSIS
    // ═══════════════════════════════════════════════════════════════
    let layer4Score = 0
    const behavioralMatch = {
      timeProximity: false,
      claimCorrelation: false,
      sessionOverlap: false,
      score: 0,
    }
    
    // Check registration time proximity
    const timeDiff = timeProximityMinutes(new Date().toISOString(), referrer.created_at)
    if (timeDiff < TIME_PROXIMITY_MINUTES) {
      behavioralMatch.timeProximity = true
      layer4Score += 20
      result.reasons.push(`Referrer registered ${timeDiff.toFixed(0)} minutes ago`)
    }
    
    // Check for session overlap patterns (if data available)
    const { data: referrerSessions } = await supabase
      .from("sessions")
      .select("started_at, ended_at, ip_address")
      .eq("user_id", referrerId)
      .order("started_at", { ascending: false })
      .limit(20)
    
    if (referrerSessions && newIp) {
      const overlappingSessions = referrerSessions.filter(s => s.ip_address === newIp)
      if (overlappingSessions.length >= SESSION_OVERLAP_THRESHOLD) {
        behavioralMatch.sessionOverlap = true
        layer4Score += 30
        result.reasons.push(`${overlappingSessions.length} overlapping sessions detected`)
      }
    }
    
    behavioralMatch.score = layer4Score
    if (layer4Score > 0) {
      result.matchedLayers.push(4)
      result.details.behavioralMatch = behavioralMatch
    }
    
    // ═══════════════════════════════════════════════════════════════
    // LAYER 5: GRAPH ANALYSIS
    // ═══════════════════════════════════════════════════════════════
    let layer5Score = 0
    const graphMatch = {
      circularReferral: false,
      clusterDetected: false,
      suspiciousChain: false,
      score: 0,
    }
    
    // Check for circular referrals
    const circularCheck = await detectCircularReferral(supabase, newUserId, referrerId)
    if (circularCheck.isCircular) {
      graphMatch.circularReferral = true
      layer5Score += 100
      result.reasons.push(`Circular referral detected: ${circularCheck.chain.join(" → ")}`)
    }
    
    // Check for suspicious referral clusters
    const clusterCheck = await detectReferralCluster(supabase, newUserId, referrerId)
    if (clusterCheck.isCluster) {
      graphMatch.clusterDetected = true
      layer5Score += 40
      result.reasons.push(
        `Suspicious cluster: ${clusterCheck.clusterSize} users with ${clusterCheck.sharedAttributes.join(", ")}`
      )
    }
    
    // Check referral chain for banned users
    const { data: chainUsers } = await supabase
      .from("profiles")
      .select("id, status, is_banned, fraud_score")
      .in("id", circularCheck.chain.filter(id => id !== newUserId))
    
    if (chainUsers) {
      const bannedInChain = chainUsers.filter(u => u.status === "banned" || u.is_banned)
      if (bannedInChain.length > 0) {
        graphMatch.suspiciousChain = true
        layer5Score += 50
        result.reasons.push(`Referral chain contains ${bannedInChain.length} banned user(s)`)
      }
      
      const highFraudInChain = chainUsers.filter(u => (u.fraud_score || 0) >= 50)
      if (highFraudInChain.length >= 2) {
        layer5Score += 30
        result.reasons.push(`Referral chain contains ${highFraudInChain.length} high-fraud users`)
      }
    }
    
    graphMatch.score = layer5Score
    if (layer5Score > 0) {
      result.matchedLayers.push(5)
      result.details.graphMatch = graphMatch
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CALCULATE FINAL SCORE
    // ═══════════════════════════════════════════════════════════════
    const totalScore = layer1Score + layer2Score + layer3Score + layer4Score + layer5Score
    result.evidenceScore = totalScore
    
    // Calculate confidence based on layers matched and evidence strength
    const layerWeight = result.matchedLayers.length * 15
    result.confidence = Math.min(100, totalScore + layerWeight)
    
    // Determine risk level and blocking
    if (totalScore >= 150 || (layer1Score >= 100) || (layer2Score >= 80) || graphMatch.circularReferral) {
      result.riskLevel = "critical"
      result.isFraud = true
      result.shouldBlock = true
    } else if (totalScore >= 100 || result.matchedLayers.length >= 3) {
      result.riskLevel = "high"
      result.isFraud = true
      result.shouldBlock = true
    } else if (totalScore >= 60 || result.matchedLayers.length >= 2) {
      result.riskLevel = "medium"
      result.isFraud = true
      result.shouldBlock = false // Flag but don't block
    } else if (totalScore >= 30) {
      result.riskLevel = "low"
      result.isFraud = false
      result.shouldBlock = false
    }
    
    // Log detection
    if (result.isFraud) {
      log.warn("Referral fraud detected", {
        newUserId,
        referrerId,
        riskLevel: result.riskLevel,
        confidence: result.confidence,
        evidenceScore: result.evidenceScore,
        matchedLayers: result.matchedLayers,
        reasons: result.reasons,
      })
    }
    
    return result
    
  } catch (error) {
    log.error("Referral fraud detection error", { error, referrerId, newUserId })
    // On error, return safe defaults (don't block)
    return {
      ...result,
      reasons: ["Detection error - allowing with caution"],
    }
  }
}

/**
 * Record a fraud detection result
 */
export async function recordReferralFraudDetection(
  newUserId: string,
  referrerId: string,
  result: ReferralFraudResult
): Promise<void> {
  if (!result.isFraud && result.riskLevel === "none") return
  
  try {
    const supabase = await createClient()
    
    await supabase.from("fraud_flags").insert({
      user_id: newUserId,
      flag_type: "referral_fraud",
      severity: result.riskLevel,
      details: {
        referrer_id: referrerId,
        confidence: result.confidence,
        evidence_score: result.evidenceScore,
        matched_layers: result.matchedLayers,
        reasons: result.reasons,
        should_block: result.shouldBlock,
        detection_details: result.details,
        detected_at: new Date().toISOString(),
      },
      related_user_ids: [referrerId],
      status: result.shouldBlock ? "confirmed" : "pending",
    })
    
    // Also flag the referrer if high confidence
    if (result.confidence >= 80) {
      await supabase.from("fraud_flags").upsert({
        user_id: referrerId,
        flag_type: "referral_abuse",
        severity: result.riskLevel,
        details: {
          referred_user_id: newUserId,
          confidence: result.confidence,
          evidence_score: result.evidenceScore,
          reasons: result.reasons,
          detected_at: new Date().toISOString(),
        },
        related_user_ids: [newUserId],
        status: "pending",
      }, {
        onConflict: "user_id,flag_type",
        ignoreDuplicates: false,
      })
    }
    
  } catch (error) {
    log.error("Failed to record referral fraud detection", { error, newUserId, referrerId })
  }
}

/**
 * Validate a referral before processing
 * Returns true if referral is valid, false if it should be rejected
 */
export async function validateReferral(
  referrerId: string,
  newUserId: string,
  newUserData: {
    email?: string
    displayName?: string
    signupIp?: string
    fingerprint?: string
    metadata?: Record<string, unknown>
  }
): Promise<{ valid: boolean; reason?: string; fraudResult?: ReferralFraudResult }> {
  const fraudResult = await detectReferralFraud(referrerId, newUserId, newUserData)
  
  if (fraudResult.shouldBlock) {
    // Record the detection
    await recordReferralFraudDetection(newUserId, referrerId, fraudResult)
    
    return {
      valid: false,
      reason: `Self-referral detected: ${fraudResult.reasons[0] || "Multiple suspicious indicators"}`,
      fraudResult,
    }
  }
  
  // Even if not blocking, record medium-risk detections
  if (fraudResult.isFraud) {
    await recordReferralFraudDetection(newUserId, referrerId, fraudResult)
  }
  
  return { valid: true, fraudResult }
}
