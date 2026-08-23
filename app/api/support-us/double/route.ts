import { createAdminClient } from "@/lib/supabase/server"
import { createServerClient } from "@supabase/ssr"
import { cookies, headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { log } from "@/lib/logger"
import { isRewardedAdsEnabled } from "@/lib/rewards/rewarded-ads"
import { verifyWatchToken } from "@/lib/rewards/watch-session"

// Triple-reward bonus: base $0.0003 + bonus $0.0006 = $0.0009 total per session.
// This endpoint sends ONLY the bonus ($0.0006) after the user watches the
// extra 11 partner ad networks below the fold.
const BONUS_REWARD_USDT = 0.0006
// FaucetPay expects amounts in smallest unit (8 decimals for USDT)
const TOTAL_REWARD_SMALLEST_UNIT = Math.floor(BONUS_REWARD_USDT * 100000000) // 60000
const ADS_PER_SESSION = 3
const COOLDOWN_SECONDS = 60 // 1 minute cooldown for triple-reward bonus
const FAUCETPAY_API_URL = "https://faucetpay.io/api/v1"

// Get FaucetPay API key from DB or env
async function getFaucetPayApiKey(db?: ReturnType<typeof createAdminClient>): Promise<string | null> {
  if (db) {
    try {
      const { data } = await db
        .from("system_settings")
        .select("value")
        .eq("key", "faucetpay_api_key")
        .single()
      const dbKey = (data?.value as string | null)?.trim()
      if (dbKey) return dbKey
    } catch { /* fall through to env */ }
  }
  return process.env.FAUCETPAY_API_KEY?.trim() || null
}

// Send FaucetPay payment
async function sendFaucetPayPayment(
  apiKey: string,
  toEmail: string,
  amount: number,
  ipAddress: string
): Promise<{ success: boolean; payoutId?: string; error?: string; balance?: number }> {
  try {
    const formData = new URLSearchParams()
    formData.append("api_key", apiKey)
    formData.append("to", toEmail)
    formData.append("amount", String(amount))
    formData.append("currency", "USDT")
    formData.append("ip_address", ipAddress)
    formData.append("referral", "false")

    log.info("FaucetPay support-us double payment request", {
      to: toEmail,
      amount,
      currency: "USDT",
      ip: ipAddress.substring(0, 10) + "..."
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(`${FAUCETPAY_API_URL}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const result = await response.json()

    log.info("FaucetPay support-us double response", { status: result.status, message: result.message })

    if (result.status === 200) {
      return {
        success: true,
        payoutId: result.payout_id,
        balance: result.balance
      }
    }

    // Map FaucetPay errors to user-friendly messages
    const errorMessages: Record<number, string> = {
      400: "FaucetPay API error. Please contact support.",
      401: "FaucetPay API key is invalid. Please contact support.",
      402: "Faucet is temporarily out of funds. Please try again later.",
      403: "FaucetPay payouts are temporarily disabled.",
      405: "Too many requests. Please wait a moment and try again.",
      450: "USDT is not supported by FaucetPay.",
      456: "Your FaucetPay email is not registered. Please link your FaucetPay account first.",
      457: "Payout amount is too small for FaucetPay minimum.",
      458: "Daily payout limit reached. Please try again tomorrow.",
      459: "Referral payout limit reached.",
      460: "Your FaucetPay account is suspended.",
      461: "Your FaucetPay account cannot receive USDT. Please link USDT on FaucetPay.",
    }

    const errorMessage = errorMessages[result.status] || result.message || "FaucetPay payment failed"
    return { success: false, error: errorMessage }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "FaucetPay request timed out. Please try again." }
    }
    log.error("FaucetPay support-us double payment exception", { error })
    return { success: false, error: "Failed to connect to FaucetPay. Please try again." }
  }
}

export async function POST(request: NextRequest) {
  // Config-gated on a real rewarded-ad provider (same gate as bonus rewards).
  if (!isRewardedAdsEnabled()) {
    return NextResponse.json({ error: "Verified support-ad sessions are not enabled" }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { adsWatched = 0, watchToken } = body

    // Get user from session directly
    const cookieStore = await cookies()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({
        success: false,
        error: "Database not configured"
      }, { status: 503 })
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server component
          }
        },
      },
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: "Please log in to claim rewards"
      }, { status: 401 })
    }

    // Validate ads watched
    if (adsWatched < ADS_PER_SESSION) {
      return NextResponse.json(
        { error: `Please watch all ${ADS_PER_SESSION} ads to claim double reward` },
        { status: 400 }
      )
    }

    // Provider-verified proof: the S2S callback must have minted a claim token
    // for this user. Client-side "adsWatched" counts alone never pay.
    if (!watchToken || typeof watchToken !== "string") {
      return NextResponse.json(
        { error: "Missing verified ad session — watch the rewarded ads first" },
        { status: 400 },
      )
    }
    try {
      verifyWatchToken(watchToken, {
        kind: "rewarded-ad",
        userId: user.id,
        resourceId: "*",
      })
    } catch {
      return NextResponse.json(
        { error: "Ad session is invalid or expired — rewatch the ads" },
        { status: 400 },
      )
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({
        success: false,
        error: "Service unavailable"
      }, { status: 503 })
    }

    // Get user profile with FaucetPay email
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("faucetpay_email, faucetpay_verified, last_support_us_double_at")
      .eq("id", user.id)
      .single()

    if (profileError && profileError.code !== "PGRST116") {
      log.error("Failed to fetch profile:", profileError)
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 })
    }

    // Check if user has FaucetPay email linked
    if (!profile?.faucetpay_email) {
      return NextResponse.json({
        success: false,
        error: "Please link your FaucetPay email in Settings to receive rewards"
      }, { status: 400 })
    }

    // Check cooldown
    if (profile?.last_support_us_double_at) {
      const lastDouble = new Date(profile.last_support_us_double_at)
      const now = new Date()
      const diffSeconds = (now.getTime() - lastDouble.getTime()) / 1000

      if (diffSeconds < COOLDOWN_SECONDS) {
        const remainingSeconds = Math.ceil(COOLDOWN_SECONDS - diffSeconds)
        return NextResponse.json(
          { error: `Please wait ${remainingSeconds} seconds before claiming again` },
          { status: 429 }
        )
      }
    }

    // Get IP address for FaucetPay
    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0] ||
      headersList.get("x-real-ip") ||
      "127.0.0.1"

    // Get FaucetPay API key
    const faucetPayApiKey = await getFaucetPayApiKey(adminSupabase)
    if (!faucetPayApiKey) {
      return NextResponse.json({
        success: false,
        error: "FaucetPay not configured. Please contact support."
      }, { status: 503 })
    }

    // Send payment directly to FaucetPay (amount in smallest unit)
    const paymentResult = await sendFaucetPayPayment(
      faucetPayApiKey,
      profile.faucetpay_email,
      TOTAL_REWARD_SMALLEST_UNIT,
      ip
    )

    if (!paymentResult.success) {
      return NextResponse.json({
        success: false,
        error: paymentResult.error || "FaucetPay payment failed"
      }, { status: 400 })
    }

    // Payment succeeded - all following operations are non-critical

    // Update last double claim timestamp (non-critical)
    try {
      await adminSupabase
        .from("profiles")
        .update({
          last_support_us_double_at: new Date().toISOString(),
        })
        .eq("id", user.id)
    } catch {
      // Profile update is non-critical since payment already succeeded
    }

    // Log the bonus reward (non-critical)
    try {
      await adminSupabase.from("claims").insert({
        user_id: user.id,
        amount_satoshis: 0,
        claim_type: "support_us_double_faucetpay",
        metadata: {
          usdt_amount: BONUS_REWARD_USDT,
          faucetpay_payout_id: paymentResult.payoutId,
          ads_watched: adsWatched
        }
      })
    } catch {
      // Claims logging is non-critical
    }

    // Update support stats (non-critical)
    try {
      const { data: existingStats } = await adminSupabase
        .from("support_stats")
        .select("total_support_earnings")
        .eq("user_id", user.id)
        .single()

      if (existingStats) {
        await adminSupabase.from("support_stats").update({
          total_support_earnings: (existingStats.total_support_earnings || 0) + BONUS_REWARD_USDT,
          updated_at: new Date().toISOString()
        }).eq("user_id", user.id)
      }
    } catch {
      // support_stats is non-critical
    }

    return NextResponse.json({
      success: true,
      bonusUSDT: BONUS_REWARD_USDT,
      payoutId: paymentResult.payoutId,
      message: `${BONUS_REWARD_USDT} USDT bonus sent to your FaucetPay account!`
    })
  } catch (error) {
    log.error("Support-us double reward error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
