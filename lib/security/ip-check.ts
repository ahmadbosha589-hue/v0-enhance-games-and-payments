// =====================================================
// IP Address Security Checks - Enhanced Version
// =====================================================

import { createClient } from "@/lib/supabase/server"
import { detectVPN, type VPNDetectionResult } from "./vpn-detection"

export interface IPCheckResult {
  isBlocked: boolean
  isVPN: boolean
  isProxy: boolean
  isTor: boolean
  isDatacenter: boolean
  riskScore: number
  country: string | null
  reason: string | null
  confidence: "low" | "medium" | "high"
  vpnDetails?: VPNDetectionResult
}

const DATACENTER_RANGES: { prefix: string; provider: string; confidence: "low" | "medium" | "high" }[] = [
  // High confidence - definitely datacenter
  { prefix: "159.203.", provider: "DigitalOcean", confidence: "high" },
  { prefix: "167.99.", provider: "DigitalOcean", confidence: "high" },
  { prefix: "206.189.", provider: "DigitalOcean", confidence: "high" },
  { prefix: "157.245.", provider: "DigitalOcean", confidence: "high" },
  { prefix: "64.227.", provider: "DigitalOcean", confidence: "high" },
  { prefix: "45.33.", provider: "Linode", confidence: "high" },
  { prefix: "172.104.", provider: "Linode", confidence: "high" },
  { prefix: "139.162.", provider: "Linode", confidence: "high" },
  { prefix: "192.81.2", provider: "Vultr", confidence: "high" },
  { prefix: "45.32.", provider: "Vultr", confidence: "high" },
  { prefix: "45.76.", provider: "Vultr", confidence: "high" },
  { prefix: "45.77.", provider: "Vultr", confidence: "high" },
  { prefix: "149.28.", provider: "Vultr", confidence: "high" },
  { prefix: "51.15.", provider: "Scaleway", confidence: "high" },
  { prefix: "163.172.", provider: "Scaleway", confidence: "high" },
  { prefix: "212.47.", provider: "Scaleway", confidence: "high" },
  { prefix: "195.154.", provider: "Scaleway", confidence: "high" },

  // Medium confidence - usually datacenter but could be CDN edge
  { prefix: "13.32.", provider: "AWS CloudFront", confidence: "medium" },
  { prefix: "13.33.", provider: "AWS CloudFront", confidence: "medium" },
  { prefix: "13.34.", provider: "AWS CloudFront", confidence: "medium" },
  { prefix: "13.35.", provider: "AWS CloudFront", confidence: "medium" },
  { prefix: "34.64.", provider: "Google Cloud", confidence: "medium" },
  { prefix: "34.65.", provider: "Google Cloud", confidence: "medium" },
  { prefix: "34.66.", provider: "Google Cloud", confidence: "medium" },
  { prefix: "35.184.", provider: "Google Cloud", confidence: "medium" },
  { prefix: "35.186.", provider: "Google Cloud", confidence: "medium" },
  { prefix: "35.192.", provider: "Google Cloud", confidence: "medium" },
  { prefix: "20.36.", provider: "Azure", confidence: "medium" },
  { prefix: "20.37.", provider: "Azure", confidence: "medium" },
  { prefix: "20.38.", provider: "Azure", confidence: "medium" },
  { prefix: "52.224.", provider: "Azure", confidence: "medium" },
  { prefix: "52.225.", provider: "Azure", confidence: "medium" },
]

const LEGITIMATE_SERVICES = [
  // Cloudflare (including WARP)
  "104.16.",
  "104.17.",
  "104.18.",
  "104.19.",
  "104.20.",
  "104.21.",
  "104.22.",
  "104.23.",
  "104.24.",
  "104.25.",
  "172.64.",
  "172.65.",
  "172.66.",
  "172.67.",
  "162.158.",
  "162.159.",
  "141.101.",
  "108.162.",
  "190.93.",
  "188.114.",
  "197.234.",
  "198.41.",
  "173.245.",
  "131.0.72.", // Cloudflare WARP
  // Apple Private Relay (legitimate privacy service)
  "17.0.",
  "17.1.",
  "17.2.",
  "17.3.",
]

export async function checkIPAddress(
  ipAddress: string,
  clientData?: {
    timezone?: string
    language?: string
    webrtcIPs?: string[]
    userAgent?: string
  },
): Promise<IPCheckResult> {
  // Check whitelist first
  const isWhitelisted = LEGITIMATE_SERVICES.some((range) => ipAddress.startsWith(range))
  if (isWhitelisted) {
    return {
      isBlocked: false,
      isVPN: false,
      isProxy: false,
      isTor: false,
      isDatacenter: false,
      riskScore: 0,
      country: null,
      reason: null,
      confidence: "high",
    }
  }

  const vpnResult = await detectVPN(ipAddress, clientData)

  // Check if IP is manually blocked in database
  const supabase = await createClient()
  const { data: ipRecord } = await supabase
    .from("ip_addresses")
    .select("is_blocked, block_reason")
    .eq("ip_address", ipAddress)
    .single()

  const isManuallyBlocked = ipRecord?.is_blocked || false
  const blockReason = ipRecord?.block_reason || null

  // Determine confidence level based on detection methods
  // With consensus-based detection, 2+ methods is already high confidence
  let confidence: "low" | "medium" | "high" = "low"
  if (vpnResult.confidence >= 80 || vpnResult.method.length >= 3) {
    confidence = "high"
  } else if (vpnResult.confidence >= 50 || vpnResult.method.length >= 2) {
    confidence = "medium"
  }

  // Determine if should block
  // The consensus system already ensures zero false positives,
  // so we can be more aggressive with blocking
  const isDetectedVPNProxy = vpnResult.isVPN || vpnResult.isProxy || vpnResult.isTor
  const shouldBlock =
    isManuallyBlocked ||
    (vpnResult.isTor && vpnResult.confidence >= 70) ||
    (isDetectedVPNProxy && confidence === "high") ||
    (vpnResult.riskScore >= 75 && confidence !== "low")

  return {
    isBlocked: shouldBlock,
    isVPN: vpnResult.isVPN,
    isProxy: vpnResult.isProxy,
    isTor: vpnResult.isTor,
    isDatacenter: vpnResult.isDatacenter,
    riskScore: vpnResult.riskScore,
    country: vpnResult.details.country || null,
    reason: shouldBlock ? blockReason || "VPN/Proxy detected with high confidence" : null,
    confidence,
    vpnDetails: vpnResult,
  }
}

export async function recordIPClaim(ipAddress: string): Promise<void> {
  const supabase = await createClient()
  await supabase.rpc("increment_ip_claims", { p_ip_address: ipAddress })
}

export async function getIPClaimsInLastHour(ipAddress: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from("claims")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ipAddress)
    .gte("created_at", new Date(Date.now() - 3600000).toISOString())

  return count || 0
}

export function getIPRateLimitMultiplier(ipCheck: IPCheckResult): number {
  if (ipCheck.isBlocked) return 0
  if (ipCheck.isTor) return 0.3 // Very strict for Tor
  if (ipCheck.isVPN && ipCheck.confidence === "high") return 0.4
  if (ipCheck.isProxy) return 0.5
  if (ipCheck.isDatacenter && ipCheck.confidence === "high") return 0.6
  if (ipCheck.isVPN) return 0.7 // Low confidence VPN
  if (ipCheck.isDatacenter) return 0.8
  return 1
}
