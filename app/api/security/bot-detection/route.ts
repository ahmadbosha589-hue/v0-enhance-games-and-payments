import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { log } from "@/lib/logger"
import { validateSecurityServerSide, type ClientSecurityPayload } from "@/lib/security/server-validation"
import { requireAdminClient } from "@/lib/supabase/admin-client"

// =====================================================
// ULTIMATE BOT DETECTION LOGGING API v3.0
// Records bot detection events with server-side verification
// Takes immediate action on confirmed threats
// =====================================================

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = requireAdminClient()
    const headersList = await headers()
    
    // Get IP
    const forwarded = headersList.get("x-forwarded-for")
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : headersList.get("x-real-ip") || "unknown"
    
    // Get user if authenticated
    const { data: { user } } = await supabase.auth.getUser()
    
    const body = await request.json()
    const { threats, score, threatLevel, timestamp, fingerprint, behaviorData } = body

    // ── SERVER-SIDE VALIDATION ──
    // Don't just trust client-reported threats - verify server-side
    let serverValidation = null
    if (user?.id) {
      const securityPayload: ClientSecurityPayload = {
        fingerprint: fingerprint,
        timestamp: timestamp || Date.now(),
        detectedThreats: threats,
        behaviorScore: behaviorData?.behaviorScore,
        mouseMovements: behaviorData?.mouseMovements,
        verificationDuration: behaviorData?.verificationDuration,
      }
      
      serverValidation = await validateSecurityServerSide(user.id, securityPayload)
      
      // If server validation says it's worse than client reported, use server's assessment
      const serverThreatLevel = serverValidation.threatLevel
      const effectiveThreatLevel = 
        (serverThreatLevel === "critical" || threatLevel === "critical") ? "critical" :
        (serverThreatLevel === "high" || threatLevel === "high") ? "high" :
        (serverThreatLevel === "medium" || threatLevel === "medium") ? "medium" :
        (serverThreatLevel === "low" || threatLevel === "low") ? "low" : "none"
      
      // Combine flags from both client and server
      const combinedThreats = [...new Set([
        ...threats,
        ...serverValidation.flags,
        ...serverValidation.correlatedThreats,
      ])]
      
      // Use maximum of client and server scores
      const effectiveScore = Math.max(score || 0, serverValidation.riskScore)
      
      log.error("Bot detection event (server-verified)", {
        userId: user.id,
        ip: ipAddress,
        clientThreats: threats,
        serverFlags: serverValidation.flags,
        combinedThreats,
        clientScore: score,
        serverScore: serverValidation.riskScore,
        effectiveScore,
        clientThreatLevel: threatLevel,
        serverThreatLevel,
        effectiveThreatLevel,
        serverFingerprint: serverValidation.serverFingerprint,
      })
    }
    
    // Log event for non-authenticated users or when server validation failed
    if (!user?.id || !serverValidation) {
      log.error("Bot detection event (client-only)", {
        userId: user?.id,
        ip: ipAddress,
        threats,
        score,
        threatLevel,
      })
    }
    
    // Log to fraud_flags table
    if (user?.id) {
      await adminSupabase.from("fraud_flags").insert({
        user_id: user.id,
        flag_type: "bot_detected",
        severity: threatLevel === "critical" ? "critical" : 
                  threatLevel === "high" ? "high" : 
                  threatLevel === "medium" ? "medium" : "low",
        details: {
          threats,
          score,
          ip: ipAddress,
          userAgent: headersList.get("user-agent"),
          timestamp,
        },
        status: "pending",
      })
      
      // Update user fraud score
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("fraud_score, is_flagged")
        .eq("id", user.id)
        .single()
      
      if (profile) {
        const newScore = Math.min(100, (profile.fraud_score || 0) + score)
        
        await adminSupabase
          .from("profiles")
          .update({
            fraud_score: newScore,
            is_flagged: newScore >= 50,
            last_fraud_flag_at: new Date().toISOString(),
            // Ban if critical threat or score >= 90
            ...(threatLevel === "critical" || newScore >= 90 ? {
              status: "banned",
              banned_at: new Date().toISOString(),
              ban_reason: `Automated bot detection: ${threats.slice(0, 3).join(", ")}`,
            } : {}),
          })
          .eq("id", user.id)
        
        // Also flag the device
        const { data: devices } = await adminSupabase
          .from("device_fingerprints")
          .select("id")
          .eq("user_id", user.id)
        
        if (devices && devices.length > 0) {
          await adminSupabase
            .from("device_fingerprints")
            .update({ is_flagged: true })
            .in("id", devices.map(d => d.id))
        }
        
        // Flag the IP
        await adminSupabase
          .from("ip_addresses")
          .update({ is_flagged: true })
          .eq("user_id", user.id)
          .eq("ip_address", ipAddress)
      }
    }
    
    // Log to audit
    await adminSupabase.from("audit_logs").insert({
      actor_id: user?.id || null,
      actor_role: "user",
      actor_ip: ipAddress,
      action: "bot_detection",
      resource_type: "security",
      resource_id: user?.id || ipAddress,
      metadata: {
        threats,
        score,
        threatLevel,
        userAgent: headersList.get("user-agent"),
      },
    })
    
    return NextResponse.json({ 
      logged: true,
      action: threatLevel === "critical" || score >= 90 ? "banned" : 
              score >= 50 ? "flagged" : "logged"
    })
  } catch (error) {
    log.error("Bot detection API error", { error })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
