import type { SupabaseClient } from "@supabase/supabase-js"
import { FRAUD_CONFIG } from "@/lib/config"

export interface FraudCheckResult {
  score: number
  flags: string[]
  shouldBlock: boolean
  requiresReview: boolean
  confidence: "low" | "medium" | "high"
  reasons: string[]
}

export interface DeviceFingerprint {
  visitorId: string
  browserName?: string
  browserVersion?: string
  osName?: string
  osVersion?: string
  deviceType?: string
  screenResolution?: string
  timezone?: string
  language?: string
}

export const FRAUD_FLAG_TYPES = {
  MULTIPLE_ACCOUNTS_IP: "multiple_accounts_same_ip",
  FLAGGED_IP: "flagged_ip_address",
  VPN_PROXY: "vpn_or_proxy_detected",
  MULTIPLE_ACCOUNTS_DEVICE: "multiple_accounts_same_device",
  FLAGGED_DEVICE: "flagged_device",
  RAPID_CLAIMING: "rapid_claiming_new_account",
  PREVIOUSLY_FLAGGED: "previously_flagged_account",
  ACCOUNT_FLAGGED: "account_flagged",
  EXCESSIVE_CLAIMS: "excessive_claim_attempts",
  HIGH_WITHDRAWAL: "high_withdrawal_volume",
  ADBLOCK_USER: "adblock_user",
  SUSPICIOUS_BEHAVIOR: "suspicious_behavior",
  BOT_DETECTED: "bot_detected",
  IMPOSSIBLE_TRAVEL: "impossible_travel_detected",
  REFERRAL_ABUSE: "referral_network_abuse",
  DEVICE_SPOOFING: "device_fingerprint_spoofing",
  TIMING_ANOMALY: "suspicious_timing_pattern",
  BANNED_DEVICE_LINK: "linked_to_banned_device",
} as const

const FRAUD_WEIGHTS = {
  [FRAUD_FLAG_TYPES.FLAGGED_DEVICE]: { score: 45, confidence: "high" },
  [FRAUD_FLAG_TYPES.BANNED_DEVICE_LINK]: { score: 50, confidence: "high" },
  [FRAUD_FLAG_TYPES.DEVICE_SPOOFING]: { score: 40, confidence: "high" },
  [FRAUD_FLAG_TYPES.ACCOUNT_FLAGGED]: { score: 50, confidence: "high" },
  [FRAUD_FLAG_TYPES.BOT_DETECTED]: { score: 60, confidence: "high" },
  [FRAUD_FLAG_TYPES.MULTIPLE_ACCOUNTS_DEVICE]: { score: 35, confidence: "medium" },
  [FRAUD_FLAG_TYPES.FLAGGED_IP]: { score: 30, confidence: "medium" },
  [FRAUD_FLAG_TYPES.IMPOSSIBLE_TRAVEL]: { score: 35, confidence: "medium" },
  [FRAUD_FLAG_TYPES.REFERRAL_ABUSE]: { score: 30, confidence: "medium" },
  [FRAUD_FLAG_TYPES.EXCESSIVE_CLAIMS]: { score: 20, confidence: "medium" },
  [FRAUD_FLAG_TYPES.MULTIPLE_ACCOUNTS_IP]: { score: 15, confidence: "low" },
  [FRAUD_FLAG_TYPES.VPN_PROXY]: { score: 10, confidence: "low" },
  [FRAUD_FLAG_TYPES.RAPID_CLAIMING]: { score: 10, confidence: "low" },
  [FRAUD_FLAG_TYPES.PREVIOUSLY_FLAGGED]: { score: 15, confidence: "low" },
  [FRAUD_FLAG_TYPES.HIGH_WITHDRAWAL]: { score: 5, confidence: "low" },
  [FRAUD_FLAG_TYPES.TIMING_ANOMALY]: { score: 10, confidence: "low" },
  [FRAUD_FLAG_TYPES.ADBLOCK_USER]: { score: 25, confidence: "medium" },
} as const

export async function calculateFraudScore(
  supabase: SupabaseClient,
  userId: string,
  ipAddress: string,
  fingerprint?: DeviceFingerprint,
): Promise<FraudCheckResult> {
  let score = 0
  const flags: string[] = []
  const reasons: string[] = []
  let highConfidenceCount = 0
  let mediumConfidenceCount = 0

  const addFlag = (flagType: keyof typeof FRAUD_WEIGHTS, reason: string) => {
    const weight = FRAUD_WEIGHTS[flagType]
    if (weight) {
      score += weight.score
      flags.push(flagType)
      reasons.push(reason)
      if (weight.confidence === "high") highConfidenceCount++
      if (weight.confidence === "medium") mediumConfidenceCount++
    }
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single()

  const accountAgeHours = profile ? (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60) : 0
  const isNewAccount = accountAgeHours < FRAUD_CONFIG.newAccountGracePeriod

  const { data: ipData } = await supabase
    .from("ip_addresses")
    .select("*, profiles!inner(id, is_banned)")
    .eq("ip_address", ipAddress)

  if (ipData && ipData.length > 0) {
    const uniqueUsers = new Set(ipData.map((ip) => ip.user_id))
    const bannedUsersOnIP = ipData.filter((ip) => ip.profiles?.is_banned).length

    if (bannedUsersOnIP > 0) {
      addFlag(FRAUD_FLAG_TYPES.FLAGGED_IP, `IP shared with ${bannedUsersOnIP} banned account(s)`)
    }

    if (uniqueUsers.size > FRAUD_CONFIG.maxAccountsPerIP && !isNewAccount) {
      addFlag(FRAUD_FLAG_TYPES.MULTIPLE_ACCOUNTS_IP, `${uniqueUsers.size} accounts on this IP`)
    }

    // Detect rapid account creation from same IP (bot farm pattern)
    const recentAccountsOnIP = ipData.filter((ip: any) => {
      if (!ip.created_at) return false
      const ageHours = (Date.now() - new Date(ip.created_at).getTime()) / (1000 * 60 * 60)
      return ageHours < 24 // accounts created in last 24h from this IP
    })
    if (recentAccountsOnIP.length > 2) {
      addFlag(FRAUD_FLAG_TYPES.MULTIPLE_ACCOUNTS_IP, `${recentAccountsOnIP.length} new accounts from this IP in 24h`)
    }

    const flaggedIp = ipData.find((ip) => ip.is_flagged)
    if (flaggedIp && !isNewAccount) {
      addFlag(FRAUD_FLAG_TYPES.FLAGGED_IP, "IP address manually flagged")
    }

    const vpnIp = ipData.find((ip) => ip.is_vpn || ip.is_proxy)
    if (vpnIp) {
      if (flags.length > 0) {
        addFlag(FRAUD_FLAG_TYPES.VPN_PROXY, "VPN/proxy detected alongside other flags")
      } else {
        score += 5
        reasons.push("VPN/proxy detected (minor penalty)")
      }
    }
  }

  if (fingerprint) {
    const { data: deviceData } = await supabase
      .from("device_fingerprints")
      .select("*, profiles!inner(id, is_banned)")
      .eq("fingerprint_hash", fingerprint.visitorId)

    if (deviceData && deviceData.length > 0) {
      const uniqueDeviceUsers = new Set(deviceData.map((d) => d.user_id))
      const bannedOnDevice = deviceData.filter((d) => d.profiles?.is_banned)

      if (bannedOnDevice.length > 0) {
        addFlag(FRAUD_FLAG_TYPES.BANNED_DEVICE_LINK, `Device linked to ${bannedOnDevice.length} banned account(s)`)
      }

      if (uniqueDeviceUsers.size >= FRAUD_CONFIG.maxAccountsPerDevice) {
        addFlag(FRAUD_FLAG_TYPES.MULTIPLE_ACCOUNTS_DEVICE, `${uniqueDeviceUsers.size} accounts on this device`)
      }

      const flaggedDevice = deviceData.find((d) => d.is_flagged)
      if (flaggedDevice) {
        addFlag(FRAUD_FLAG_TYPES.FLAGGED_DEVICE, "Device manually flagged by admin")
      }

      const { data: userDevices } = await supabase
        .from("device_fingerprints")
        .select("fingerprint_hash, created_at")
        .eq("user_id", userId)

      if (userDevices && userDevices.length > 5) {
        addFlag(FRAUD_FLAG_TYPES.DEVICE_SPOOFING, `${userDevices.length} different device fingerprints detected`)
      }
    }
  }

  if (profile) {
    if (accountAgeHours < 24 && profile.total_claims > 20) {
      addFlag(FRAUD_FLAG_TYPES.RAPID_CLAIMING, `${profile.total_claims} claims in first 24 hours`)
    }

    const daysSinceLastFlag = profile.last_fraud_flag_at
      ? (Date.now() - new Date(profile.last_fraud_flag_at).getTime()) / (1000 * 60 * 60 * 24)
      : 999

    const decayAmount = Math.min(daysSinceLastFlag * FRAUD_CONFIG.scoreDecayPerDay, FRAUD_CONFIG.maxScoreDecayPerWeek)

    const effectiveFraudScore = Math.max(0, (profile.fraud_score || 0) - decayAmount)
    if (effectiveFraudScore > 0) {
      score += Math.min(effectiveFraudScore * 0.5, 30)
      if (effectiveFraudScore > 30) {
        flags.push(FRAUD_FLAG_TYPES.PREVIOUSLY_FLAGGED)
        reasons.push(`Historical fraud score: ${effectiveFraudScore.toFixed(0)}`)
      }
    }

    if (profile.is_flagged) {
      addFlag(FRAUD_FLAG_TYPES.ACCOUNT_FLAGGED, "Account currently flagged for review")
    }
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: claimCount } = await supabase
    .from("claims")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", oneHourAgo)

  if (claimCount && claimCount > 30) {
    addFlag(FRAUD_FLAG_TYPES.EXCESSIVE_CLAIMS, `${claimCount} claims in the last hour`)
  }

  const { data: recentWithdrawals } = await supabase
    .from("withdrawals")
    .select("amount_satoshis, created_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(10)

  if (recentWithdrawals && recentWithdrawals.length >= 5) {
    const totalWithdrawn = recentWithdrawals.reduce((sum, w) => sum + Number(w.amount_satoshis), 0)
    if (totalWithdrawn > 200000 && accountAgeHours < 168) {
      addFlag(FRAUD_FLAG_TYPES.HIGH_WITHDRAWAL, `${totalWithdrawn} satoshis withdrawn in first week`)
    }
  }

  if (profile && ipAddress) {
    const { data: recentLocations } = await supabase
      .from("claims")
      .select("ip_address, created_at, metadata")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5)

    if (recentLocations && recentLocations.length >= 2) {
      const lastClaim = recentLocations[0]
      const timeDiffMinutes = lastClaim ? (Date.now() - new Date(lastClaim.created_at).getTime()) / (1000 * 60) : 999

      if (timeDiffMinutes < 30 && lastClaim.ip_address !== ipAddress) {
        const ipParts1 = ipAddress.split(".")
        const ipParts2 = lastClaim.ip_address?.split(".") || []

        if (ipParts1[0] !== ipParts2[0] || ipParts1[1] !== ipParts2[1]) {
          if (flags.length > 0) {
            addFlag(FRAUD_FLAG_TYPES.IMPOSSIBLE_TRAVEL, "Rapid IP location change detected")
          }
        }
      }
    }
  }

  if (profile?.referred_by) {
    const { data: referralNetwork } = await supabase
      .from("profiles")
      .select("id, is_banned, fraud_score")
      .eq("referred_by", profile.referred_by)
      .limit(20)

    if (referralNetwork) {
      const bannedReferrals = referralNetwork.filter((r) => r.is_banned).length
      const highFraudReferrals = referralNetwork.filter((r) => (r.fraud_score || 0) > 50).length

      if (bannedReferrals > 3 || highFraudReferrals > 5) {
        addFlag(
          FRAUD_FLAG_TYPES.REFERRAL_ABUSE,
          `Referrer has ${bannedReferrals} banned and ${highFraudReferrals} high-fraud referrals`,
        )
      }
    }
  }

  score = Math.min(Math.max(Math.round(score), 0), 100)

  let confidence: "low" | "medium" | "high" = "low"
  if (highConfidenceCount >= 2 || (highConfidenceCount >= 1 && mediumConfidenceCount >= 2)) {
    confidence = "high"
  } else if (highConfidenceCount >= 1 || mediumConfidenceCount >= 2) {
    confidence = "medium"
  }

  const shouldBlock =
    score >= FRAUD_CONFIG.autoBanScore || (score >= FRAUD_CONFIG.autoBlockClaimScore && confidence === "high")

  const requiresReview = !shouldBlock && (score >= FRAUD_CONFIG.manualReviewScore || confidence === "medium")

  return {
    score,
    flags,
    shouldBlock,
    requiresReview,
    confidence,
    reasons,
  }
}

export async function logFraudFlag(
  supabase: SupabaseClient,
  userId: string,
  flagType: string,
  severity: "low" | "medium" | "high" | "critical",
  details: Record<string, unknown>,
): Promise<void> {
  const severityScore = severity === "critical" ? 9 : severity === "high" ? 7 : severity === "medium" ? 5 : 3
  await supabase.from("fraud_flags").insert({
    user_id: userId,
    fraud_type: flagType,
    severity: severityScore,
    evidence: details,
    status: "pending_review",
  })
}

export async function updateUserFraudScore(supabase: SupabaseClient, userId: string, newScore: number): Promise<void> {
  await supabase
    .from("profiles")
    .update({
      fraud_score: newScore,
      is_flagged: newScore >= FRAUD_CONFIG.manualReviewScore,
    })
    .eq("id", userId)
}

export async function recordDeviceFingerprint(
  supabase: SupabaseClient,
  userId: string,
  fingerprint: DeviceFingerprint,
): Promise<void> {
  const { data: existing } = await supabase
    .from("device_fingerprints")
    .select("id")
    .eq("user_id", userId)
    .eq("fingerprint_hash", fingerprint.visitorId)
    .single()

  if (existing) {
    await supabase
      .from("device_fingerprints")
      .update({
        last_seen_at: new Date().toISOString(),
        browser_info: {
          name: fingerprint.browserName,
          version: fingerprint.browserVersion,
        },
        os_info: {
          name: fingerprint.osName,
          version: fingerprint.osVersion,
        },
        device_type: fingerprint.deviceType,
        screen_resolution: fingerprint.screenResolution,
        timezone: fingerprint.timezone,
        language: fingerprint.language,
      })
      .eq("id", existing.id)
  } else {
    await supabase.from("device_fingerprints").insert({
      user_id: userId,
      fingerprint_hash: fingerprint.visitorId,
      browser_info: {
        name: fingerprint.browserName,
        version: fingerprint.browserVersion,
      },
      os_info: {
        name: fingerprint.osName,
        version: fingerprint.osVersion,
      },
      device_type: fingerprint.deviceType,
      screen_resolution: fingerprint.screenResolution,
      timezone: fingerprint.timezone,
      language: fingerprint.language,
    })
  }
}

export async function recordIpAddress(
  supabase: SupabaseClient,
  userId: string,
  ipAddress: string,
  geoData?: {
    country?: string
    region?: string
    city?: string
    isVpn?: boolean
    isProxy?: boolean
  },
): Promise<void> {
  const { data: existing } = await supabase
    .from("ip_addresses")
    .select("id, request_count")
    .eq("user_id", userId)
    .eq("ip_address", ipAddress)
    .single()

  if (existing) {
    await supabase
      .from("ip_addresses")
      .update({
        last_seen_at: new Date().toISOString(),
        request_count: existing.request_count + 1,
      })
      .eq("id", existing.id)
  } else {
    await supabase.from("ip_addresses").insert({
      user_id: userId,
      ip_address: ipAddress,
      country: geoData?.country,
      region: geoData?.region,
      city: geoData?.city,
      is_vpn: geoData?.isVpn || false,
      is_proxy: geoData?.isProxy || false,
    })
  }
}
