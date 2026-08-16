// =====================================================
// Device Fingerprint Utilities
// =====================================================

import { createHash } from "crypto"

export interface DeviceInfo {
  userAgent: string
  language: string
  timezone: string
  screenResolution: string
  colorDepth?: number
  hardwareConcurrency?: number
  deviceMemory?: number
  platform?: string
  webglVendor?: string
  webglRenderer?: string
  canvasFingerprint?: string
  audioFingerprint?: string
  fonts?: string[]
}

export function generateFingerprintHash(deviceInfo: DeviceInfo): string {
  const components = [
    deviceInfo.userAgent,
    deviceInfo.language,
    deviceInfo.timezone,
    deviceInfo.screenResolution,
    deviceInfo.colorDepth?.toString() || "",
    deviceInfo.hardwareConcurrency?.toString() || "",
    deviceInfo.platform || "",
    deviceInfo.webglVendor || "",
    deviceInfo.webglRenderer || "",
    deviceInfo.canvasFingerprint || "",
  ]

  return createHash("sha256").update(components.join("|")).digest("hex")
}

export function parseUserAgent(userAgent: string): {
  browserName: string
  browserVersion: string
  osName: string
  osVersion: string
  deviceType: string
} {
  const ua = userAgent.toLowerCase()

  // Browser detection
  let browserName = "Unknown"
  let browserVersion = ""

  if (ua.includes("firefox/")) {
    browserName = "Firefox"
    browserVersion = ua.match(/firefox\/([\d.]+)/)?.[1] || ""
  } else if (ua.includes("edg/")) {
    browserName = "Edge"
    browserVersion = ua.match(/edg\/([\d.]+)/)?.[1] || ""
  } else if (ua.includes("chrome/")) {
    browserName = "Chrome"
    browserVersion = ua.match(/chrome\/([\d.]+)/)?.[1] || ""
  } else if (ua.includes("safari/") && !ua.includes("chrome")) {
    browserName = "Safari"
    browserVersion = ua.match(/version\/([\d.]+)/)?.[1] || ""
  }

  // OS detection
  let osName = "Unknown"
  let osVersion = ""

  if (ua.includes("windows")) {
    osName = "Windows"
    if (ua.includes("windows nt 10")) osVersion = "10"
    else if (ua.includes("windows nt 11")) osVersion = "11"
  } else if (ua.includes("mac os")) {
    osName = "macOS"
    osVersion = ua.match(/mac os x ([\d_]+)/)?.[1]?.replace(/_/g, ".") || ""
  } else if (ua.includes("linux")) {
    osName = "Linux"
  } else if (ua.includes("android")) {
    osName = "Android"
    osVersion = ua.match(/android ([\d.]+)/)?.[1] || ""
  } else if (ua.includes("iphone") || ua.includes("ipad")) {
    osName = "iOS"
    osVersion = ua.match(/os ([\d_]+)/)?.[1]?.replace(/_/g, ".") || ""
  }

  // Device type
  let deviceType = "desktop"
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
    deviceType = "mobile"
  } else if (ua.includes("tablet") || ua.includes("ipad")) {
    deviceType = "tablet"
  }

  return { browserName, browserVersion, osName, osVersion, deviceType }
}

export function calculateDeviceTrustScore(
  timesSeenCount: number,
  daysSinceFirstSeen: number,
  associatedAccounts: number,
  flaggedClaims: number,
): number {
  let score = 50 // Base score

  // Increase for device age
  if (daysSinceFirstSeen > 30) score += 20
  else if (daysSinceFirstSeen > 7) score += 10
  else if (daysSinceFirstSeen > 1) score += 5

  // Increase for consistent usage
  if (timesSeenCount > 100) score += 15
  else if (timesSeenCount > 50) score += 10
  else if (timesSeenCount > 10) score += 5

  // Decrease for multiple accounts
  if (associatedAccounts > 5) score -= 30
  else if (associatedAccounts > 3) score -= 20
  else if (associatedAccounts > 1) score -= 10

  // Decrease for flagged claims
  score -= flaggedClaims * 5

  return Math.max(0, Math.min(100, score))
}
