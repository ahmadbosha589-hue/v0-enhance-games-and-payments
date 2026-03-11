import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { detectVPN } from "@/lib/security/vpn-detection"
import { log } from "@/lib/logger"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"
  const fingerprint = searchParams.get("fingerprint")
  const ref = searchParams.get("ref")

  const headersList = await headers()
  const clientIP =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    headersList.get("cf-connecting-ip") ||
    "unknown"

  const userAgent = headersList.get("user-agent") || "unknown"

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?error=invalid_code`)
  }

  try {
    const supabase = await createClient()

    if (!supabase) {
      console.error("[Auth Callback] Supabase client not available")
      return NextResponse.redirect(`${origin}/auth/error?error=service_unavailable`)
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data.user) {
      console.error("Auth exchange error:", error)
      return NextResponse.redirect(`${origin}/auth/error?error=auth_failed`)
    }

    const email = data.user.email?.toLowerCase() || ""

    // Gmail-only restriction
    if (!email.endsWith("@gmail.com")) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/auth/error?error=gmail_only`)
    }

    const userId = data.user.id
    const isNewUser = data.user.created_at ? Date.now() - new Date(data.user.created_at).getTime() < 60000 : false

    const googleId =
      data.user.user_metadata?.sub ||
      data.user.user_metadata?.provider_id ||
      data.user.identities?.find((i) => i.provider === "google")?.id

    if (googleId) {
      // Check if this Google account is already linked to another user
      const { data: existingGoogleUser } = await supabase
        .from("profiles")
        .select("id, email, is_banned")
        .neq("id", userId)
        .or(`metadata->google_id.eq.${googleId},metadata->>google_id.eq.${googleId}`)
        .single()

      if (existingGoogleUser) {
        // This Google account is already linked to another user
        await supabase.from("fraud_flags").insert({
          user_id: userId,
          fraud_type: "duplicate_google_account",
          severity: 10,
          status: "pending",
          evidence: {
            google_id: googleId,
            existing_user_id: existingGoogleUser.id,
            existing_email: existingGoogleUser.email,
            new_email: email,
            is_existing_banned: existingGoogleUser.is_banned,
          },
          related_user_ids: [existingGoogleUser.id],
        })

        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/auth/error?error=google_already_linked`)
      }

      // Store Google ID in profile metadata
      await supabase
        .from("profiles")
        .update({
          metadata: {
            google_id: googleId,
            last_google_login: new Date().toISOString(),
          },
          last_active_at: new Date().toISOString(),
        })
        .eq("id", userId)
    }

    // ── VPN CHECK ON AUTH ──
    // Run VPN detection in background (non-blocking but logged)
    if (clientIP !== "unknown") {
      detectVPN(clientIP, { userAgent })
        .then(async (vpnResult) => {
          if (vpnResult.isVPN || vpnResult.isProxy || vpnResult.isTor) {
            log.warn("VPN/Proxy detected during auth", {
              userId,
              ip: clientIP,
              isVPN: vpnResult.isVPN,
              isProxy: vpnResult.isProxy,
              isTor: vpnResult.isTor,
              confidence: vpnResult.confidence,
              isNewUser,
            })

            const adminSupabase = createAdminClient()
            
            // Record VPN usage in fraud_flags
            await adminSupabase.from("fraud_flags").upsert({
              user_id: userId,
              flag_type: "vpn_on_auth",
              severity: vpnResult.isTor ? "high" : vpnResult.confidence >= 85 ? "high" : "medium",
              details: {
                ip: clientIP,
                vpn: vpnResult.isVPN,
                proxy: vpnResult.isProxy,
                tor: vpnResult.isTor,
                confidence: vpnResult.confidence,
                methods: vpnResult.method,
                provider: vpnResult.details.provider,
                country: vpnResult.details.country,
                isNewUser,
              },
              status: "pending",
            }, {
              onConflict: "user_id,flag_type",
              ignoreDuplicates: false,
            })

            // For new signups with VPN, increase fraud score
            if (isNewUser) {
              await adminSupabase
                .from("profiles")
                .update({ 
                  fraud_score: vpnResult.isTor ? 80 : vpnResult.confidence >= 85 ? 60 : 40,
                })
                .eq("id", userId)
            }
          }
        })
        .catch((err) => {
          log.error("VPN check failed during auth", { error: err, userId })
        })
    }

    // ── MULTI-ACCOUNT CHECK ──
    // Check if this fingerprint is associated with other accounts
    if (fingerprint) {
      const adminSupabase = createAdminClient()
      
      // Find other accounts with this fingerprint
      const { data: existingFingerprints } = await adminSupabase
        .from("device_fingerprints")
        .select("user_id, times_seen, is_trusted")
        .eq("fingerprint_hash", fingerprint)
        .neq("user_id", userId)
        .limit(10)

      if (existingFingerprints && existingFingerprints.length > 0) {
        const otherUserIds = existingFingerprints.map(f => f.user_id)
        
        log.warn("Multi-account detected via fingerprint", {
          userId,
          fingerprint: fingerprint.substring(0, 16) + "...",
          otherAccountCount: otherUserIds.length,
          isNewUser,
        })

        // Record multi-account detection
        await adminSupabase.from("fraud_flags").upsert({
          user_id: userId,
          flag_type: "multi_account_fingerprint",
          severity: otherUserIds.length >= 3 ? "critical" : otherUserIds.length >= 2 ? "high" : "medium",
          details: {
            fingerprint: fingerprint.substring(0, 32),
            other_user_ids: otherUserIds,
            other_account_count: otherUserIds.length,
            isNewUser,
            detected_at: new Date().toISOString(),
          },
          related_user_ids: otherUserIds,
          status: "pending",
        }, {
          onConflict: "user_id,flag_type",
          ignoreDuplicates: false,
        })

        // Increase fraud score based on number of linked accounts
        const fraudScoreIncrease = Math.min(100, otherUserIds.length * 25)
        await adminSupabase.rpc("increment_fraud_score", {
          p_user_id: userId,
          p_amount: fraudScoreIncrease,
        }).catch(() => {
          // RPC might not exist, update directly
          adminSupabase
            .from("profiles")
            .update({ fraud_score: fraudScoreIncrease })
            .eq("id", userId)
            .then(() => {})
        })
      }
    }

    // Store device fingerprint if provided (non-blocking)
    if (fingerprint) {
      supabase
        .from("device_fingerprints")
        .upsert(
          {
            user_id: userId,
            fingerprint_hash: fingerprint,
            last_seen_at: new Date().toISOString(),
            first_seen_at: new Date().toISOString(),
            times_seen: 1,
            is_trusted: true,
            user_agent: userAgent,
            ip_addresses: clientIP !== "unknown" ? [clientIP] : [],
          },
          {
            onConflict: "user_id,fingerprint_hash",
            ignoreDuplicates: false,
          },
        )
        .then(() => {
          log.info("Device fingerprint stored", { userId })
        })
        .catch((err) => {
          log.error("Failed to store fingerprint", { error: err, userId })
        })
    }

    // Update last active (non-blocking)
    supabase
      .from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", userId)
      .then(() => {
        console.log("[Auth Callback] Profile updated")
      })
      .catch((err) => {
        console.error("[Auth Callback] Failed to update profile:", err)
      })

    // Handle referral for new users (non-blocking)
    if (isNewUser && ref) {
      supabase
        .from("profiles")
        .select("id, referral_code, is_banned")
        .eq("referral_code", ref)
        .single()
        .then(({ data: referrer }) => {
          if (referrer && referrer.id !== userId && !referrer.is_banned) {
            supabase.from("profiles").update({ referred_by: referrer.id }).eq("id", userId)
          }
        })
        .catch((err) => {
          console.error("[Auth Callback] Referral processing failed:", err)
        })
    }

    // Redirect immediately to avoid timeout
    const forwardedHost = request.headers.get("x-forwarded-host")
    const isLocalEnv = process.env.NODE_ENV === "development"

    if (isLocalEnv) {
      return NextResponse.redirect(`${origin}${next}`)
    } else if (forwardedHost) {
      return NextResponse.redirect(`https://${forwardedHost}${next}`)
    } else {
      return NextResponse.redirect(`${origin}${next}`)
    }
  } catch (err) {
    console.error("Auth callback error:", err)
    return NextResponse.redirect(`${origin}/auth/error?error=server_error`)
  }
}
