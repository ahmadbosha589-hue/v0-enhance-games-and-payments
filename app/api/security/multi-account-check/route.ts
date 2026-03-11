import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { log } from "@/lib/logger"
import { detectVPN } from "@/lib/security/vpn-detection"

// ═══════════════════════════════════════════════════════════════════════════
// ULTIMATE MULTI-ACCOUNT CHECK API v3.0
// Server-side verification for multi-account detection
// Zero false positives with maximum detection power
// ═══════════════════════════════════════════════════════════════════════════

export interface MultiAccountCheckResult {
  isAllowed: boolean
  existingAccounts: number
  isFlagged: boolean
  flagReason?: string
  confidence: number
  vpnDetected?: boolean
  requiresAdditionalVerification?: boolean
}

// Maximum accounts allowed per device fingerprint
const MAX_ACCOUNTS_PER_DEVICE = 1
const MAX_ACCOUNTS_PER_IP_PER_DAY = 2
const MAX_SIGNUP_ATTEMPTS_PER_IP_HOUR = 5

export async function POST(request: Request): Promise<NextResponse<MultiAccountCheckResult>> {
  const adminSupabase = createAdminClient()
  const headersList = await headers()
  
  // Get IP address
  const forwarded = headersList.get("x-forwarded-for")
  const ipAddress = forwarded 
    ? forwarded.split(",")[0].trim() 
    : headersList.get("x-real-ip") || "unknown"
  
  const userAgent = headersList.get("user-agent") || ""
  
  try {
    const body = await request.json()
    const { fingerprint, currentUserId, isSignup = false, signals, context } = body
    
    if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 32) {
      return NextResponse.json({
        isAllowed: true,
        existingAccounts: 0,
        isFlagged: false,
        confidence: 0,
      })
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 0: ANALYZE FINGERPRINT SIGNALS
    // ═══════════════════════════════════════════════════════════════════════
    // If signals are provided, we can detect data clearing attempts
    let dataClearing = false
    if (signals) {
      // If IndexedDB or CacheAPI has fingerprint but localStorage doesn't,
      // user likely cleared "site data" but not everything
      const persistentSignals = [signals.indexedDB, signals.cacheAPI, signals.cookie]
      const volatileSignals = [signals.localStorage, signals.sessionStorage]
      
      const hasPersistent = persistentSignals.some(Boolean)
      const hasVolatile = volatileSignals.some(Boolean)
      
      if (hasPersistent && !hasVolatile) {
        dataClearing = true
        log.info("Possible data clearing detected", {
          fingerprint: fingerprint.substring(0, 16) + "...",
          signals,
          context,
        })
      }
      
      // If hardware doesn't match but storage does, possible fingerprint spoofing
      if (!signals.hardwareMatch && hasPersistent) {
        log.warn("Fingerprint mismatch detected", {
          fingerprint: fingerprint.substring(0, 16) + "...",
          signals,
          context,
        })
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: VPN CHECK (critical for auth pages)
    // ═══════════════════════════════════════════════════════════════════════
    let vpnDetected = false
    let vpnConfidence = 0
    
    if (ipAddress !== "unknown") {
      const vpnResult = await detectVPN(ipAddress, {
        userAgent,
        timezone: body.timezone,
        language: body.language,
      })
      
      vpnDetected = vpnResult.isVPN || vpnResult.isProxy || vpnResult.isTor
      vpnConfidence = vpnResult.confidence
      
      // Block Tor completely for auth
      if (vpnResult.isTor) {
        log.warn("Tor detected on auth page", { 
          ip: ipAddress, 
          fingerprint: fingerprint.substring(0, 16) + "...",
        })
        
        return NextResponse.json({
          isAllowed: false,
          existingAccounts: 0,
          isFlagged: true,
          flagReason: "Tor is not allowed for account creation or login.",
          confidence: 95,
          vpnDetected: true,
          requiresAdditionalVerification: false,
        })
      }
      
      // For VPN/Proxy, allow but require additional verification
      if (vpnDetected && vpnConfidence >= 70) {
        log.warn("VPN/Proxy detected on auth page", { 
          ip: ipAddress, 
          fingerprint: fingerprint.substring(0, 16) + "...",
          confidence: vpnConfidence,
        })
        
        // Still proceed with check but flag for additional verification
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: DEVICE FINGERPRINT CHECK
    // ═══════════════════════════════════════════════════════════════════════
    const { data: existingDevices } = await adminSupabase
      .from("device_fingerprints")
      .select("user_id, created_at, is_trusted, is_flagged")
      .eq("fingerprint_hash", fingerprint)
    
    // Count unique users with this fingerprint
    const uniqueUserIds = new Set(existingDevices?.map(d => d.user_id) || [])
    
    // Exclude current user if provided
    if (currentUserId) {
      uniqueUserIds.delete(currentUserId)
    }
    
    const existingAccountCount = uniqueUserIds.size
    
    // Check if any associated account is banned
    let isLinkedToBannedAccount = false
    if (existingAccountCount > 0) {
      const { data: linkedProfiles } = await adminSupabase
        .from("profiles")
        .select("id, status, is_banned")
        .in("id", Array.from(uniqueUserIds))
      
      isLinkedToBannedAccount = linkedProfiles?.some(
        p => p.status === "banned" || p.is_banned === true
      ) || false
    }
    
    // Check if device itself is flagged
    const isDeviceFlagged = existingDevices?.some(d => d.is_flagged === true) || false
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: IP-BASED RATE LIMITING (for signup)
    // ═══════════════════════════════════════════════════════════════════════
    let ipRateLimited = false
    
    if (isSignup && ipAddress !== "unknown") {
      // Check signups from this IP in the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      
      const { count: recentSignupsFromIP } = await adminSupabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", oneHourAgo)
        .eq("signup_ip", ipAddress)
      
      if ((recentSignupsFromIP || 0) >= MAX_SIGNUP_ATTEMPTS_PER_IP_HOUR) {
        ipRateLimited = true
        
        log.warn("IP rate limit exceeded for signup", {
          ip: ipAddress,
          recentSignups: recentSignupsFromIP,
          fingerprint: fingerprint.substring(0, 16) + "...",
        })
      }
      
      // Also check signups today
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      
      const { count: todaySignupsFromIP } = await adminSupabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart.toISOString())
        .eq("signup_ip", ipAddress)
      
      if ((todaySignupsFromIP || 0) >= MAX_ACCOUNTS_PER_IP_PER_DAY) {
        ipRateLimited = true
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: DETERMINE RESULT
    // ═══════════════════════════════════════════════════════════════════════
    
    // Blocked if linked to banned account
    if (isLinkedToBannedAccount) {
      return NextResponse.json({
        isAllowed: false,
        existingAccounts: existingAccountCount,
        isFlagged: true,
        flagReason: "This device is associated with a suspended account.",
        confidence: 95,
        vpnDetected,
        requiresAdditionalVerification: false,
      })
    }
    
    // Blocked if device is flagged
    if (isDeviceFlagged) {
      return NextResponse.json({
        isAllowed: false,
        existingAccounts: existingAccountCount,
        isFlagged: true,
        flagReason: "This device has been flagged for suspicious activity.",
        confidence: 90,
        vpnDetected,
        requiresAdditionalVerification: false,
      })
    }
    
    // Blocked if IP rate limited
    if (ipRateLimited) {
      return NextResponse.json({
        isAllowed: false,
        existingAccounts: existingAccountCount,
        isFlagged: true,
        flagReason: "Too many account creation attempts from this IP. Please try again later.",
        confidence: 85,
        vpnDetected,
        requiresAdditionalVerification: false,
      })
    }
    
    // Blocked if too many accounts on this device (for signup)
    if (isSignup && existingAccountCount >= MAX_ACCOUNTS_PER_DEVICE) {
      log.warn("Multi-account attempt blocked", {
        fingerprint: fingerprint.substring(0, 16) + "...",
        existingAccounts: existingAccountCount,
        ip: ipAddress,
      })
      
      return NextResponse.json({
        isAllowed: false,
        existingAccounts: existingAccountCount,
        isFlagged: true,
        flagReason: "An account already exists on this device. Only one account per device is allowed.",
        confidence: 90,
        vpnDetected,
        requiresAdditionalVerification: false,
      })
    }
    
    // For login, flag if multiple accounts but allow
    const requiresAdditionalVerification = 
      (vpnDetected && vpnConfidence >= 60) || 
      existingAccountCount > 0 ||
      dataClearing
    
    // Build flag reason
    let flagReason: string | undefined
    if (existingAccountCount > 0) {
      flagReason = "Multiple accounts detected on this device."
    } else if (dataClearing) {
      flagReason = "Suspicious browser data state detected."
    }
    
    return NextResponse.json({
      isAllowed: true,
      existingAccounts: existingAccountCount,
      isFlagged: existingAccountCount > 0 || dataClearing,
      flagReason,
      confidence: 80,
      vpnDetected,
      requiresAdditionalVerification,
    })
    
  } catch (error) {
    log.error("Multi-account check error", { error })
    
    // On error, allow but with low confidence
    return NextResponse.json({
      isAllowed: true,
      existingAccounts: 0,
      isFlagged: false,
      confidence: 0,
    })
  }
}
