// =============================================================================
// =============================================================================
// ULTIMATE VPN CHECK API v6.0 - FORTRESS EDITION (2026)
// =============================================================================
// =============================================================================
//
// ███████╗ ██████╗ ██████╗ ████████╗██████╗ ███████╗███████╗███████╗
// ██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝██╔══██╗██╔════╝██╔════╝██╔════╝
// █████╗  ██║   ██║██████╔╝   ██║   ██████╔╝█████╗  ███████╗███████╗
// ██╔══╝  ██║   ██║██╔══██╗   ██║   ██╔══██╗██╔══╝  ╚════██║╚════██║
// ██║     ╚██████╔╝██║  ██║   ██║   ██║  ██║███████╗███████║███████║
// ╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝
//
// v6.0 - AN ATOM BEFORE FALSE POSITIVE | 100% SERVER-SIDE
//
// CORE PRINCIPLES:
// 1. NEVER TRUST CLIENT-SIDE - 100% server-side verification
// 2. ZERO FALSE POSITIVES - Strict consensus (3+ sources required)
// 3. MAXIMUM DETECTION - 18+ APIs, 450+ ASNs, 750+ CIDR ranges
// 4. TOR DETECTION - Real-time exit node sync from 6+ sources
// 5. RESIDENTIAL PROXY DETECTION - Advanced SPUR.us integration
//
// DETECTION METHODS:
// - Tor Exit Node Lists (real-time sync from 3+ sources)
// - Datacenter CIDR Matching (500+ ranges)
// - ASN Database (350+ VPN/hosting ASNs)
// - 10+ External APIs in parallel
// - WebRTC Leak Detection
// - Timezone/Country Mismatch
// - Device Fingerprint Anomalies
//
// CONSENSUS VOTING:
// - VPN: 4+ weighted votes from 2+ sources
// - Proxy: 4+ weighted votes from 2+ sources  
// - Tor: Exit node list OR 3+ API confirmations
// - Datacenter: 3+ confirmations
// - Residential Proxy: 3+ specialized API confirmations
//
// =============================================================================

import { type NextRequest, NextResponse } from "next/server"
import { detectVPNFortress, type ClientVPNData } from "@/lib/security/vpn-fortress"
import { headers } from "next/headers"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { log } from "@/lib/logger"

export async function POST(request: NextRequest) {
  try {
    const headersList = await headers()
    
    // Get IP address from multiple sources for reliability
    const ipAddress =
      headersList.get("cf-connecting-ip") || // Cloudflare
      headersList.get("x-real-ip") ||
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown"

    if (ipAddress === "unknown" || !ipAddress) {
      return NextResponse.json({ error: "Could not determine IP" }, { status: 400 })
    }

    // Get client-reported data (used for cross-validation, NEVER trusted alone)
    const body = await request.json()
    const clientData: ClientVPNData = {
      webrtcIPs: body.webrtcIPs,
      timezone: body.timezone,
      language: body.language,
      screenResolution: body.screenResolution,
      userAgent: body.userAgent,
      connection: body.connection,
      // Enhanced v5.0 fields
      deviceMemory: body.deviceMemory,
      hardwareConcurrency: body.hardwareConcurrency,
      platform: body.platform,
      plugins: body.plugins,
      canvas: body.canvas,
      webgl: body.webgl,
      audioContext: body.audioContext,
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RUN VPN FORTRESS DETECTION
    // ═══════════════════════════════════════════════════════════════════════════

    const result = await detectVPNFortress(ipAddress, clientData)

    // ═══════════════════════════════════════════════════════════════════════════
    // LOG AND STORE DETECTION FOR AUTHENTICATED USERS
    // ═══════════════════════════════════════════════════════════════════════════

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user?.id) {
      // Log detection event
      if (result.isVPN || result.isProxy || result.isTor) {
        log.warn("VPN/Proxy detected by VPN Fortress", {
          userId: user.id,
          ip: ipAddress,
          isVPN: result.isVPN,
          isProxy: result.isProxy,
          isTor: result.isTor,
          isDatacenter: result.isDatacenter,
          confidence: result.confidence,
          riskScore: result.riskScore,
          methods: result.methods,
          consensus: result.consensus,
          shouldBlock: result.shouldBlock,
          riskLevel: result.riskLevel,
        })
      }

      // Store in fraud_flags for tracking
      if (result.shouldBlock || result.riskLevel === "high" || result.riskLevel === "critical") {
        const adminSupabase = createAdminClient()
        
        await adminSupabase.from("fraud_flags").upsert({
          user_id: user.id,
          flag_type: "vpn_detected",
          severity: result.riskLevel === "critical" ? "critical" :
                   result.isTor ? "critical" :
                   result.confidence >= 90 ? "high" : "medium",
          details: {
            ip: ipAddress,
            vpn: result.isVPN,
            proxy: result.isProxy,
            tor: result.isTor,
            datacenter: result.isDatacenter,
            hosting: result.isHosting,
            confidence: result.confidence,
            riskScore: result.riskScore,
            methods: result.methods,
            factors: result.factors,
            consensus: result.consensus,
            provider: result.details.provider,
            isp: result.details.isp,
            country: result.details.country,
            city: result.details.city,
            asn: result.details.asn,
            shouldBlock: result.shouldBlock,
            riskLevel: result.riskLevel,
          },
          status: "pending",
        }, {
          onConflict: "user_id,flag_type",
          ignoreDuplicates: false,
        })

        // Update user profile if should block
        if (result.shouldBlock) {
          await adminSupabase.from("profiles").update({
            vpn_detected_at: new Date().toISOString(),
            vpn_detection_confidence: result.confidence,
            vpn_detection_methods: result.methods,
            last_vpn_ip: ipAddress,
          }).eq("id", user.id)
        }
      }

      // Store in IP reputation log
      try {
        const adminSupabase = createAdminClient()
        
        await adminSupabase.from("vpn_detection_log").insert({
          user_id: user.id,
          ip_address: ipAddress,
          is_vpn: result.isVPN,
          is_proxy: result.isProxy,
          is_tor: result.isTor,
          is_datacenter: result.isDatacenter,
          confidence: result.confidence,
          risk_score: result.riskScore,
          risk_level: result.riskLevel,
          should_block: result.shouldBlock,
          methods: result.methods,
          consensus: result.consensus,
          details: result.details,
          factors: result.factors,
        })
      } catch {
        // Ignore logging errors
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RETURN DETECTION RESULT
    // ═══════════════════════════════════════════════════════════════════════════

    return NextResponse.json({
      // Core detection results
      isAllowed: !result.shouldBlock,
      isVPN: result.isVPN,
      isProxy: result.isProxy,
      isTor: result.isTor,
      isDatacenter: result.isDatacenter,
      isHosting: result.isHosting,
      isResidentialProxy: result.isResidentialProxy,
      
      // Risk assessment
      riskLevel: result.riskLevel,
      riskScore: result.riskScore,
      confidence: result.confidence,
      shouldBlock: result.shouldBlock,
      
      // Detection details
      methods: result.methods,
      methodCount: result.methods.length,
      
      // Consensus information (v5.0 enhanced)
      consensus: {
        totalSources: result.consensus.totalSources,
        vpnVotes: result.consensus.vpnVotes,
        proxyVotes: result.consensus.proxyVotes,
        torVotes: result.consensus.torVotes,
        datacenterVotes: result.consensus.datacenterVotes,
        residentialProxyVotes: result.consensus.residentialProxyVotes,
        agreementRatio: result.consensus.agreementRatio,
        strongAgreement: result.consensus.strongAgreement,
      },
      
      // Provider details
      details: {
        provider: result.details.provider,
        country: result.details.country,
        city: result.details.city,
        isp: result.details.isp,
        asn: result.details.asn,
        connectionType: result.details.connectionType,
      },
      
      // User-facing message
      message: result.shouldBlock
        ? result.isTor
          ? "Tor connection detected. Please use a regular internet connection to continue."
          : result.isVPN
            ? "VPN detected. Please disable your VPN to continue."
            : result.isProxy
              ? "Proxy detected. Please connect directly to continue."
              : "Suspicious connection detected. Please use a regular connection."
        : result.riskLevel === "medium" || result.riskLevel === "high"
          ? "Your connection may be flagged for review."
          : "OK",
    })
  } catch (error) {
    log.error("VPN check error", { error })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

// GET endpoint for quick IP check without auth
export async function GET(request: NextRequest) {
  try {
    const headersList = await headers()
    
    const ipAddress =
      headersList.get("cf-connecting-ip") ||
      headersList.get("x-real-ip") ||
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown"

    if (ipAddress === "unknown" || !ipAddress) {
      return NextResponse.json({ error: "Could not determine IP" }, { status: 400 })
    }

    // Run detection without client data
    const result = await detectVPNFortress(ipAddress)

    // Return simplified result
    return NextResponse.json({
      ip: ipAddress,
      isAllowed: !result.shouldBlock,
      riskLevel: result.riskLevel,
      isThreat: result.isVPN || result.isProxy || result.isTor,
      confidence: result.confidence,
    })
  } catch (error) {
    log.error("VPN check GET error", { error })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
