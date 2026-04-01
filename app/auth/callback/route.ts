import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { detectVPNFortress } from "@/lib/security/vpn-fortress"
import { validateReferral } from "@/lib/security/referral-fraud-detector"
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

    // ══════════════════════════════════════════════════════════════════════════
    // VPN FORTRESS CHECK (BLOCKING FOR BOTH SIGNUP AND LOGIN)
    // Uses VPN Fortress v6.0 - Maximum power detection with zero false positives
    // ══════════════════════════════════════════════════════════════════════════
    if (clientIP !== "unknown") {
      try {
        const vpnResult = await detectVPNFortress(clientIP, { userAgent })

        const isVPNThreat = vpnResult.isVPN || vpnResult.isProxy || vpnResult.isTor || vpnResult.isResidentialProxy

        if (isVPNThreat || vpnResult.shouldBlock) {
          log.warn("VPN Fortress: Threat detected during auth", {
            userId,
            ip: clientIP,
            isVPN: vpnResult.isVPN,
            isProxy: vpnResult.isProxy,
            isTor: vpnResult.isTor,
            isResidentialProxy: vpnResult.isResidentialProxy,
            isDatacenter: vpnResult.isDatacenter,
            confidence: vpnResult.confidence,
            riskLevel: vpnResult.riskLevel,
            shouldBlock: vpnResult.shouldBlock,
            methods: vpnResult.methods,
            consensus: vpnResult.consensus,
            isNewUser,
          })

          const adminSupabase = createAdminClient()

          // Record VPN usage in fraud_flags with detailed info
          await adminSupabase.from("fraud_flags").upsert({
            user_id: userId,
            flag_type: "vpn_on_auth",
            severity: vpnResult.isTor ? "critical" :
              vpnResult.isResidentialProxy ? "critical" :
                vpnResult.riskLevel === "critical" ? "critical" :
                  vpnResult.riskLevel === "high" ? "high" : "medium",
            details: {
              ip: clientIP,
              vpn: vpnResult.isVPN,
              proxy: vpnResult.isProxy,
              tor: vpnResult.isTor,
              residentialProxy: vpnResult.isResidentialProxy,
              datacenter: vpnResult.isDatacenter,
              hosting: vpnResult.isHosting,
              confidence: vpnResult.confidence,
              riskLevel: vpnResult.riskLevel,
              riskScore: vpnResult.riskScore,
              shouldBlock: vpnResult.shouldBlock,
              methods: vpnResult.methods,
              factors: vpnResult.factors,
              consensus: vpnResult.consensus,
              provider: vpnResult.details.provider,
              isp: vpnResult.details.isp,
              country: vpnResult.details.country,
              city: vpnResult.details.city,
              asn: vpnResult.details.asn,
              isNewUser,
            },
            status: "pending",
          }, {
            onConflict: "user_id,flag_type",
            ignoreDuplicates: false,
          })

          // HARDENED BLOCKING: Block based on VPN Fortress recommendations
          // Block for NEW SIGNUPS: Tor, Residential Proxy, or shouldBlock=true, or confidence >= 40
          if (isNewUser && (vpnResult.isTor || vpnResult.isResidentialProxy || vpnResult.shouldBlock || vpnResult.confidence >= 40)) {
            await adminSupabase
              .from("profiles")
              .update({
                fraud_score: 100,
                is_banned: true,
                ban_reason: `VPN/Proxy detected during signup (${vpnResult.isTor ? "Tor" :
                    vpnResult.isResidentialProxy ? "Residential Proxy" :
                      vpnResult.isProxy ? "Proxy" : "VPN"
                  }, confidence: ${vpnResult.confidence}%, risk: ${vpnResult.riskLevel})`,
                status: "banned",
              })
              .eq("id", userId)

            await supabase.auth.signOut()
            return NextResponse.redirect(`${origin}/auth/error?error=vpn_blocked`)
          }

          // HARDENED BLOCKING: Block for EXISTING USERS on login with high-confidence threats
          // Block if: Tor, Residential Proxy, shouldBlock=true, or confidence >= 60
          if (!isNewUser && (vpnResult.isTor || vpnResult.isResidentialProxy || vpnResult.shouldBlock || vpnResult.confidence >= 60)) {
            // Don't ban existing users, but block this login attempt
            await adminSupabase
              .from("profiles")
              .update({
                fraud_score: Math.min(100, vpnResult.riskScore + 30),
                vpn_detected_at: new Date().toISOString(),
                vpn_detection_confidence: vpnResult.confidence,
                vpn_detection_methods: vpnResult.methods,
                last_vpn_ip: clientIP,
              })
              .eq("id", userId)

            await supabase.auth.signOut()
            return NextResponse.redirect(`${origin}/auth/error?error=vpn_blocked`)
          }

          // For lower-confidence VPN on login, increase fraud score but allow
          if (!isNewUser && isVPNThreat && vpnResult.confidence < 60) {
            await adminSupabase
              .from("profiles")
              .update({
                fraud_score: Math.min(80, vpnResult.riskScore),
                vpn_detected_at: new Date().toISOString(),
              })
              .eq("id", userId)
          }
        }
      } catch (err) {
        log.error("VPN Fortress check failed during auth", { error: err, userId })
        // On VPN check failure, allow but log - don't block legitimate users due to API issues
      }
    }

    // ── MULTI-ACCOUNT CHECK (BLOCKING FOR NEW SIGNUPS) ──
    // Check if this fingerprint is associated with other accounts
    if (fingerprint) {
      const adminSupabase = createAdminClient()

      // Find other accounts with this fingerprint
      const { data: existingFingerprints } = await adminSupabase
        .from("device_fingerprints")
        .select("user_id, times_seen, is_trusted, is_flagged")
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

        // Check if any linked account is banned (indicates fraud ring)
        const { data: linkedProfiles } = await adminSupabase
          .from("profiles")
          .select("id, status, is_banned, fraud_score")
          .in("id", otherUserIds)

        const hasBannedLinkedAccount = linkedProfiles?.some(p => p.status === "banned" || p.is_banned)
        const hasHighFraudLinkedAccount = linkedProfiles?.some(p => (p.fraud_score || 0) >= 70)
        const isDeviceFlagged = existingFingerprints.some(f => f.is_flagged)

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
            hasBannedLinkedAccount,
            hasHighFraudLinkedAccount,
            isDeviceFlagged,
            detected_at: new Date().toISOString(),
          },
          related_user_ids: otherUserIds,
          status: "pending",
        }, {
          onConflict: "user_id,flag_type",
          ignoreDuplicates: false,
        })

        // BLOCKING: For new signups, block if:
        // 1. Already has an account on this device (1 account per device rule)
        // 2. Linked to a banned account
        // 3. Device is flagged
        if (isNewUser && (otherUserIds.length >= 1 || hasBannedLinkedAccount || isDeviceFlagged)) {
          const blockReason = hasBannedLinkedAccount
            ? "This device is linked to a suspended account"
            : isDeviceFlagged
              ? "This device has been flagged for suspicious activity"
              : "Only one account per device is allowed"

          // Ban the new account
          await adminSupabase
            .from("profiles")
            .update({
              fraud_score: 100,
              is_banned: true,
              ban_reason: blockReason,
              status: "banned",
            })
            .eq("id", userId)

          // Also flag the device
          await adminSupabase
            .from("device_fingerprints")
            .update({ is_flagged: true })
            .eq("fingerprint_hash", fingerprint)

          // Sign out and redirect to error
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/auth/error?error=multi_account_blocked`)
        }

        // For existing users, increase fraud score (non-blocking)
        const fraudScoreIncrease = Math.min(100, otherUserIds.length * 25 + (hasBannedLinkedAccount ? 50 : 0))
        await adminSupabase.rpc("increment_fraud_score", {
          p_user_id: userId,
          p_amount: fraudScoreIncrease,
        }).catch(() => {
          // RPC might not exist, update directly
          adminSupabase
            .from("profiles")
            .update({ fraud_score: fraudScoreIncrease })
            .eq("id", userId)
            .then(() => { })
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

    // Update last active and store signup IP for new users (non-blocking)
    const profileUpdate: Record<string, unknown> = {
      last_active_at: new Date().toISOString(),
      last_login_ip: clientIP !== "unknown" ? clientIP : null,
    }

    // Store signup IP for new users (important for fraud detection)
    if (isNewUser && clientIP !== "unknown") {
      profileUpdate.signup_ip = clientIP
    }

    supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", userId)
      .then(() => {
        console.log("[Auth Callback] Profile updated")
      })
      .catch((err) => {
        console.error("[Auth Callback] Failed to update profile:", err)
      })

    // Handle referral for new users with ROBUST fraud detection
    if (isNewUser && ref) {
      try {
        const adminSupabase = createAdminClient()
        
        // Find the referrer
        const { data: referrer } = await adminSupabase
          .from("profiles")
          .select("id, referral_code, is_banned, status, fraud_score")
          .eq("referral_code", ref.toUpperCase())
          .single()
        
        if (referrer && referrer.id !== userId && !referrer.is_banned && referrer.status !== "banned") {
          
          // ═══════════════════════════════════════════════════════════════
          // ROBUST REFERRAL FRAUD DETECTION
          // Multi-layer protection against self-referrals and bot networks
          // ═══════════════════════════════════════════════════════════════
          const referralValidation = await validateReferral(
            referrer.id,
            userId,
            {
              email,
              displayName: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
              signupIp: clientIP !== "unknown" ? clientIP : undefined,
              fingerprint: fingerprint || undefined,
              metadata: {
                google_id: googleId,
                user_agent: userAgent,
              },
            }
          )
          
          if (referralValidation.valid) {
            // Referral is valid - apply it
            await adminSupabase
              .from("profiles")
              .update({ referred_by: referrer.id })
              .eq("id", userId)
            
            // Increment referrer's count
            await adminSupabase.rpc("increment_referral_count", {
              p_referrer_id: referrer.id,
            }).catch(() => {
              // Fallback if RPC doesn't exist
              adminSupabase
                .from("profiles")
                .update({
                  referral_count: (referrer as { referral_count?: number }).referral_count 
                    ? (referrer as { referral_count?: number }).referral_count! + 1 
                    : 1,
                })
                .eq("id", referrer.id)
            })
            
            log.info("Valid referral applied", {
              newUserId: userId,
              referrerId: referrer.id,
              referralCode: ref,
            })
          } else {
            // Referral is FRAUD - block it and log
            log.warn("Referral fraud blocked", {
              newUserId: userId,
              referrerId: referrer.id,
              referralCode: ref,
              reason: referralValidation.reason,
              confidence: referralValidation.fraudResult?.confidence,
              riskLevel: referralValidation.fraudResult?.riskLevel,
              matchedLayers: referralValidation.fraudResult?.matchedLayers,
            })
            
            // Increase fraud score for the new user
            await adminSupabase
              .from("profiles")
              .update({
                fraud_score: Math.min(100, (referralValidation.fraudResult?.confidence || 50)),
              })
              .eq("id", userId)
            
            // If high confidence, also penalize the referrer (potential abuse)
            if (referralValidation.fraudResult && referralValidation.fraudResult.confidence >= 80) {
              await adminSupabase.rpc("increment_fraud_score", {
                p_user_id: referrer.id,
                p_amount: 20,
              }).catch(() => {
                adminSupabase
                  .from("profiles")
                  .update({
                    fraud_score: Math.min(100, (referrer.fraud_score || 0) + 20),
                  })
                  .eq("id", referrer.id)
              })
            }
          }
        } else if (referrer && referrer.id === userId) {
          // Attempting to self-refer with same user ID - immediate ban
          log.warn("Direct self-referral attempt", { userId, referralCode: ref })
          
          await adminSupabase.from("fraud_flags").insert({
            user_id: userId,
            flag_type: "direct_self_referral",
            severity: "critical",
            details: {
              referral_code: ref,
              detected_at: new Date().toISOString(),
            },
            status: "confirmed",
          })
          
          await adminSupabase
            .from("profiles")
            .update({
              fraud_score: 100,
              is_banned: true,
              ban_reason: "Self-referral attempt",
              status: "banned",
            })
            .eq("id", userId)
          
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/auth/error?error=self_referral_blocked`)
        }
      } catch (err) {
        log.error("Referral processing error", { error: err, userId, ref })
        // On error, don't apply referral but allow signup
      }
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
