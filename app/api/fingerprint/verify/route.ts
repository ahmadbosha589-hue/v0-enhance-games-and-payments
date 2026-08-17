import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { log } from "@/lib/logger"
import { parseUserAgent, calculateDeviceTrustScore } from "@/lib/security/device-fingerprint"
import { detectVPN } from "@/lib/security/vpn-detection"
import { requireAdminClient } from "@/lib/supabase/admin-client"

// =====================================================
// ULTIMATE FINGERPRINT VERIFICATION API v3.0
// Multi-account detection with persistent fingerprinting
// One account per device enforcement
// =====================================================

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = requireAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { fingerprintHash, deviceInfo } = body

    if (!fingerprintHash || typeof fingerprintHash !== "string" || fingerprintHash.length < 32) {
      return NextResponse.json({ error: "Invalid fingerprint" }, { status: 400 })
    }

    const headersList = await headers()
    const forwarded = headersList.get("x-forwarded-for")
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : headersList.get("x-real-ip") || "127.0.0.1"
    const userAgentStr = headersList.get("user-agent") || ""

    const parsedUA = parseUserAgent(userAgentStr)

    // ── Check if this fingerprint is linked to any banned accounts ──────────
    const { data: existingDeviceRecords } = await adminSupabase
      .from("device_fingerprints")
      .select("user_id, is_trusted, is_flagged, times_seen, created_at")
      .eq("fingerprint_hash", fingerprintHash)

    let isBannedDevice = false
    let isLinkedToBanned = false
    let associatedAccountCount = 0
    const otherUserIds: string[] = []

    if (existingDeviceRecords && existingDeviceRecords.length > 0) {
      associatedAccountCount = new Set(existingDeviceRecords.map((r) => r.user_id)).size
      otherUserIds.push(
        ...existingDeviceRecords.filter((r) => r.user_id !== user.id).map((r) => r.user_id),
      )

      // Check if the device itself is flagged
      isBannedDevice = existingDeviceRecords.some((r) => r.is_flagged === true)

      // Check if any associated accounts are banned
      if (otherUserIds.length > 0) {
        const { data: linkedProfiles } = await adminSupabase
          .from("profiles")
          .select("id, status, is_banned")
          .in("id", otherUserIds)

        if (linkedProfiles) {
          isLinkedToBanned = linkedProfiles.some(
            (p) => p.status === "banned" || p.is_banned === true,
          )
        }
      }
    }

    // ── Upsert the fingerprint record for this user ────────────────────────
    const { data: existingRecord } = await adminSupabase
      .from("device_fingerprints")
      .select("id, times_seen, created_at")
      .eq("user_id", user.id)
      .eq("fingerprint_hash", fingerprintHash)
      .single()

    if (existingRecord) {
      // Update existing record
      await adminSupabase
        .from("device_fingerprints")
        .update({
          last_seen_at: new Date().toISOString(),
          times_seen: (existingRecord.times_seen || 0) + 1,
          browser_info: {
            name: parsedUA.browserName,
            version: parsedUA.browserVersion,
          },
          os_info: {
            name: parsedUA.osName,
            version: parsedUA.osVersion,
          },
          device_type: parsedUA.deviceType,
          screen_resolution: deviceInfo?.screenResolution || null,
          timezone: deviceInfo?.timezone || null,
          language: deviceInfo?.language || null,
        })
        .eq("id", existingRecord.id)

      // Calculate trust score
      const daysSinceFirstSeen = existingRecord.created_at
        ? (Date.now() - new Date(existingRecord.created_at).getTime()) / (1000 * 60 * 60 * 24)
        : 0

      const { count: flaggedClaimCount } = await adminSupabase
        .from("claims")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_flagged", true)

      const trustScore = calculateDeviceTrustScore(
        (existingRecord.times_seen || 0) + 1,
        daysSinceFirstSeen,
        associatedAccountCount,
        flaggedClaimCount || 0,
      )

      await adminSupabase
        .from("device_fingerprints")
        .update({ trust_score: trustScore })
        .eq("id", existingRecord.id)
    } else {
      // Insert new record
      await adminSupabase.from("device_fingerprints").insert({
        user_id: user.id,
        fingerprint_hash: fingerprintHash,
        browser_info: {
          name: parsedUA.browserName,
          version: parsedUA.browserVersion,
        },
        os_info: {
          name: parsedUA.osName,
          version: parsedUA.osVersion,
        },
        device_type: parsedUA.deviceType,
        screen_resolution: deviceInfo?.screenResolution || null,
        timezone: deviceInfo?.timezone || null,
        language: deviceInfo?.language || null,
        is_trusted: !isBannedDevice && !isLinkedToBanned,
        trust_score: 50,
        times_seen: 1,
      })
    }

    // ── Record IP alongside ──────────────────────────────────────────────────
    const { data: existingIp } = await adminSupabase
      .from("ip_addresses")
      .select("id, request_count")
      .eq("user_id", user.id)
      .eq("ip_address", ipAddress)
      .single()

    if (existingIp) {
      await adminSupabase
        .from("ip_addresses")
        .update({
          last_seen_at: new Date().toISOString(),
          request_count: (existingIp.request_count || 0) + 1,
        })
        .eq("id", existingIp.id)
    } else {
      await adminSupabase.from("ip_addresses").insert({
        user_id: user.id,
        ip_address: ipAddress,
      })
    }

    // ── Flag the user if device is linked to banned accounts ─────────────────
    if (isLinkedToBanned || isBannedDevice) {
      log.warn("Device linked to banned account detected", {
        userId: user.id,
        fingerprintHash,
        isBannedDevice,
        isLinkedToBanned,
        otherUserIds,
      })

      await adminSupabase.from("fraud_flags").insert({
        user_id: user.id,
        flag_type: isBannedDevice ? "flagged_device" : "linked_to_banned_device",
        severity: "high",
        details: {
          fingerprint_hash: fingerprintHash,
          linked_user_ids: otherUserIds,
          ip_address: ipAddress,
          detected_at: new Date().toISOString(),
        },
        status: "pending",
      })

      // Update the user's fraud score
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("fraud_score")
        .eq("id", user.id)
        .single()

      if (profile) {
        const newScore = Math.min((profile.fraud_score || 0) + (isBannedDevice ? 45 : 35), 100)
        await adminSupabase
          .from("profiles")
          .update({
            fraud_score: newScore,
            is_flagged: newScore >= 50,
            last_fraud_flag_at: new Date().toISOString(),
          })
          .eq("id", user.id)
      }
    }

    // ── Flag multi-account usage on same device ──────────────────────────────
    if (associatedAccountCount > 3 && !isLinkedToBanned && !isBannedDevice) {
      log.warn("Multiple accounts on same device", {
        userId: user.id,
        fingerprintHash,
        accountCount: associatedAccountCount,
      })

      await adminSupabase.from("fraud_flags").insert({
        user_id: user.id,
        flag_type: "multiple_accounts_same_device",
        severity: associatedAccountCount > 5 ? "high" : "medium",
        details: {
          fingerprint_hash: fingerprintHash,
          account_count: associatedAccountCount,
          ip_address: ipAddress,
          detected_at: new Date().toISOString(),
        },
        status: "pending",
      })
    }

    // ── VPN CHECK ────────────────────────────────────────────────────────────
    let vpnDetected = false
    let vpnConfidence = 0
    
    try {
      const vpnResult = await detectVPN(ipAddress, { userAgent: userAgentStr })
      vpnDetected = vpnResult.isVPN || vpnResult.isProxy || vpnResult.isTor
      vpnConfidence = vpnResult.confidence
      
      if (vpnDetected && vpnResult.confidence >= 70) {
        await adminSupabase.from("fraud_flags").upsert({
          user_id: user.id,
          flag_type: "vpn_on_fingerprint_verify",
          severity: vpnResult.isTor ? "high" : vpnResult.confidence >= 85 ? "high" : "medium",
          details: {
            ip: ipAddress,
            vpn: vpnResult.isVPN,
            proxy: vpnResult.isProxy,
            tor: vpnResult.isTor,
            confidence: vpnResult.confidence,
            methods: vpnResult.method,
          },
          status: "pending",
        }, {
          onConflict: "user_id,flag_type",
          ignoreDuplicates: false,
        })
      }
    } catch (err) {
      log.error("VPN check failed during fingerprint verify", { error: err, userId: user.id })
    }

    // ── Determine response status ────────────────────────────────────────────
    let status: "trusted" | "flagged" | "blocked" = "trusted"
    let message: string | null = null
    let isMultiAccount = false

    if (isBannedDevice) {
      status = "blocked"
      message = "This device has been flagged for suspicious activity."
    } else if (isLinkedToBanned) {
      status = "blocked"
      message = "This device has been linked to a suspended account."
    } else if (associatedAccountCount > 1) {
      // Stricter: flag any device with more than 1 account
      status = associatedAccountCount > 3 ? "blocked" : "flagged"
      isMultiAccount = true
      message = "Multiple accounts detected on this device."
    } else if (vpnDetected && vpnConfidence >= 85) {
      status = "flagged"
      message = "VPN/Proxy detected. Some features may be restricted."
    }

    return NextResponse.json({
      verified: true,
      status,
      message,
      associatedAccounts: associatedAccountCount,
      isMultiAccount,
      vpnDetected,
      vpnConfidence,
    })
  } catch (error) {
    log.error("Fingerprint verify error", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
