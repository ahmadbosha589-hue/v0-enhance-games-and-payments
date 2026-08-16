import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"

// Validate a referral code with fraud checks
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")

    if (!code) {
      return NextResponse.json({ valid: false, error: "No code provided" })
    }

    // Normalize code
    const normalizedCode = code.toUpperCase().trim()
    
    // Validate format
    if (!/^[A-Z0-9]{6,12}$/.test(normalizedCode)) {
      return NextResponse.json({ valid: false, error: "Invalid code format" })
    }

    const supabase = await createClient()
    const headersList = await headers()
    
    const clientIP =
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headersList.get("x-real-ip") ||
      headersList.get("cf-connecting-ip") ||
      "unknown"

    // Get the referrer with fraud checks
    const { data: referrer } = await supabase
      .from("profiles")
      .select(`
        id, 
        display_name, 
        referral_count, 
        status, 
        is_banned,
        fraud_score,
        referral_blocked_count,
        signup_ip,
        last_login_ip
      `)
      .eq("referral_code", normalizedCode)
      .single()

    if (!referrer) {
      return NextResponse.json({ valid: false, error: "Invalid referral code" })
    }

    // Check if referrer is banned
    if (referrer.status === "banned" || referrer.status === "suspended" || referrer.is_banned) {
      return NextResponse.json({ valid: false, error: "This referral code is no longer active" })
    }

    // Check if referrer has high fraud score
    if (referrer.fraud_score >= 70) {
      return NextResponse.json({ 
        valid: false, 
        error: "This referral code has been flagged for suspicious activity" 
      })
    }

    // Check for abuse pattern
    if (referrer.referral_blocked_count >= 5) {
      return NextResponse.json({ 
        valid: false, 
        error: "This referral code has been disabled due to abuse" 
      })
    }

    // Check if current user's IP matches referrer (potential self-referral)
    // This is a soft check - full check happens at signup
    let isSuspicious = false
    if (clientIP !== "unknown") {
      if (referrer.signup_ip === clientIP || referrer.last_login_ip === clientIP) {
        isSuspicious = true
      }
    }

    return NextResponse.json({
      valid: true,
      referrer: {
        displayName: referrer.display_name || "Anonymous",
        referralCount: referrer.referral_count,
      },
      // Don't reveal suspicion to client, but we log it server-side
      _meta: isSuspicious ? { 
        warning: "IP match with referrer", 
        shouldMonitor: true 
      } : undefined,
    })
  } catch (error) {
    console.error("Referral validation error:", error)
    return NextResponse.json({ valid: false, error: "Validation failed" })
  }
}

// POST endpoint for checking if a user can be referred
export async function POST(request: Request) {
  try {
    const { referralCode, fingerprint } = await request.json()
    
    if (!referralCode) {
      return NextResponse.json({ valid: false, error: "No referral code" })
    }

    const normalizedCode = referralCode.toUpperCase().trim()
    const supabase = await createClient()
    const headersList = await headers()
    
    const clientIP =
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headersList.get("x-real-ip") ||
      headersList.get("cf-connecting-ip") ||
      "unknown"

    // Get referrer
    const { data: referrer } = await supabase
      .from("profiles")
      .select("id, status, is_banned, fraud_score, signup_ip, last_login_ip")
      .eq("referral_code", normalizedCode)
      .single()

    if (!referrer || referrer.is_banned || referrer.status === "banned") {
      return NextResponse.json({ valid: false, error: "Invalid or banned referrer" })
    }

    // Run server-side fraud detection
    const fraudIndicators: string[] = []
    let fraudScore = 0

    // Check 1: IP match
    if (clientIP !== "unknown" && (referrer.signup_ip === clientIP || referrer.last_login_ip === clientIP)) {
      fraudIndicators.push("ip_match")
      fraudScore += 60
    }

    // Check 2: Fingerprint match (if provided)
    if (fingerprint) {
      const { data: refFingerprints } = await supabase
        .from("device_fingerprints")
        .select("fingerprint_hash")
        .eq("user_id", referrer.id)
      
      if (refFingerprints?.some(f => f.fingerprint_hash === fingerprint)) {
        fraudIndicators.push("fingerprint_match")
        fraudScore += 80
      }
    }

    // Check 3: Too many accounts from this IP recently
    if (clientIP !== "unknown") {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("signup_ip", clientIP)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      
      if ((count || 0) >= 3) {
        fraudIndicators.push("ip_abuse")
        fraudScore += 40
      }
    }

    // Check 4: Referrer has high fraud score
    if (referrer.fraud_score >= 50) {
      fraudIndicators.push("high_fraud_referrer")
      fraudScore += 30
    }

    const shouldBlock = fraudScore >= 100

    return NextResponse.json({
      valid: !shouldBlock,
      error: shouldBlock ? "Referral blocked due to suspicious activity" : undefined,
      _debug: process.env.NODE_ENV === "development" ? {
        fraudScore,
        fraudIndicators,
      } : undefined,
    })
  } catch (error) {
    console.error("Referral validation POST error:", error)
    return NextResponse.json({ valid: false, error: "Validation failed" })
  }
}
