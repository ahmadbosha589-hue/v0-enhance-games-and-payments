import { NextRequest, NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { FaucetPayClient } from "@/lib/faucetpay/client"

const CLAIM_VALUE_USD = 0.0001 // $0.0001 per claim

// Get FaucetPay API key for a specific currency from admin settings
async function getFaucetPayApiKey(supabase: ReturnType<typeof createAdminClient>, currency: string): Promise<string | null> {
  if (!supabase) return null

  try {
    const { data } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", `faucetpay_api_key_${currency.toLowerCase()}`)
      .single()

    return data?.value || null
  } catch {
    // Fall back to environment variable
    return process.env.FAUCETPAY_API_KEY || null
  }
}

// Get user's FaucetPay linked address for a currency
async function getUserFaucetPayAddress(supabase: ReturnType<typeof createAdminClient>, userId: string, currency: string): Promise<string | null> {
  if (!supabase) return null

  try {
    const { data } = await supabase
      .from("profiles")
      .select("faucetpay_email")
      .eq("id", userId)
      .single()

    // FaucetPay uses email as the identifier for payouts
    return data?.faucetpay_email || null
  } catch {
    return null
  }
}
const COOLDOWN_SECONDS = 7 // 7 seconds between claims per crypto
const SHORTLINK_REQUIRED_AFTER = 100 // After 100 claims, require a shortlink

// CoinGecko API for live prices
async function getCryptoPrice(symbol: string): Promise<number> {
  const coinGeckoIds: Record<string, string> = {
    LTC: "litecoin",
    ETH: "ethereum",
    DOGE: "dogecoin",
    TRX: "tron",
    FEY: "feyorra",
    ZEC: "zcash",
    BCH: "bitcoin-cash",
    DASH: "dash",
    DGB: "digibyte",
    SOL: "solana",
    BNB: "binancecoin",
    MATIC: "matic-network",
    USDT: "tether",
  }

  const geckoId = coinGeckoIds[symbol]
  if (!geckoId) return 0

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
      { next: { revalidate: 60 } }
    )
    const data = await response.json()
    return data[geckoId]?.usd || 0
  } catch {
    // Fallback prices
    const fallback: Record<string, number> = {
      LTC: 115,
      ETH: 3500,
      DOGE: 0.38,
      TRX: 0.26,
      FEY: 0.0001,
      ZEC: 45,
      BCH: 480,
      DASH: 32,
      DGB: 0.015,
      SOL: 190,
      BNB: 700,
      MATIC: 0.55,
      USDT: 1,
    }
    return fallback[symbol] || 0
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { cryptoSymbol, captchaToken, fingerprint } = body

    if (!cryptoSymbol || !captchaToken) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const validSymbols = ["LTC", "ETH", "DOGE", "TRX", "FEY", "ZEC", "BCH", "DASH", "DGB", "SOL", "BNB", "MATIC", "USDT"]
    if (!validSymbols.includes(cryptoSymbol)) {
      return NextResponse.json({ error: "Invalid cryptocurrency" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Handle case where Supabase client couldn't be created
    if (!adminSupabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
    }

    // Get user profile
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Check if user is active
    if (profile.status !== "active") {
      return NextResponse.json({ error: "Account is not active" }, { status: 403 })
    }

    // Check for VPN/fraud
    if (profile.is_flagged && profile.fraud_score >= 70) {
      return NextResponse.json({ error: "Account under review" }, { status: 403 })
    }

    // Get IP address for rate limiting
    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0] ||
      headersList.get("x-real-ip") ||
      "unknown"

    // Check if IP has claimed recently (rate limiting)
    const { data: recentIpClaims } = await adminSupabase
      .from("manual_faucet_claims")
      .select("claimed_at")
      .eq("ip_address", ip)
      .eq("crypto_symbol", cryptoSymbol)
      .order("claimed_at", { ascending: false })
      .limit(1)

    if (recentIpClaims && recentIpClaims.length > 0) {
      const lastClaim = new Date(recentIpClaims[0].claimed_at).getTime()
      const elapsed = (Date.now() - lastClaim) / 1000
      if (elapsed < COOLDOWN_SECONDS) {
        return NextResponse.json(
          { error: "Cooldown active", cooldownRemaining: Math.ceil(COOLDOWN_SECONDS - elapsed) },
          { status: 429 }
        )
      }
    }

    // Check cooldown for this user and crypto
    const { data: recentClaims } = await adminSupabase
      .from("manual_faucet_claims")
      .select("claimed_at")
      .eq("user_id", user.id)
      .eq("crypto_symbol", cryptoSymbol)
      .order("claimed_at", { ascending: false })
      .limit(1)

    if (recentClaims && recentClaims.length > 0) {
      const lastClaim = new Date(recentClaims[0].claimed_at).getTime()
      const elapsed = (Date.now() - lastClaim) / 1000
      if (elapsed < COOLDOWN_SECONDS) {
        return NextResponse.json(
          { error: "Cooldown active", cooldownRemaining: Math.ceil(COOLDOWN_SECONDS - elapsed) },
          { status: 429 }
        )
      }
    }

    // Check total claims today and shortlink requirement
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { count: totalClaimsToday } = await adminSupabase
      .from("manual_faucet_claims")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("claimed_at", today.toISOString())

    // If at 100, 200, 300, etc. claims, check for shortlink completion
    if (totalClaimsToday && totalClaimsToday > 0 && totalClaimsToday % SHORTLINK_REQUIRED_AFTER === 0) {
      const { data: lastClaim } = await adminSupabase
        .from("manual_faucet_claims")
        .select("claimed_at")
        .eq("user_id", user.id)
        .order("claimed_at", { ascending: false })
        .limit(1)

      const lastClaimTime = lastClaim?.[0]?.claimed_at

      const { data: shortlinkAfterClaim } = await adminSupabase
        .from("shortlink_views")
        .select("viewed_at")
        .eq("user_id", user.id)
        .gte("viewed_at", lastClaimTime || today.toISOString())
        .limit(1)

      if (!shortlinkAfterClaim || shortlinkAfterClaim.length === 0) {
        return NextResponse.json(
          { error: "Shortlink required. Complete 1 shortlink to continue claiming." },
          { status: 403 }
        )
      }
    }

    // Get crypto price and calculate amount
    const price = await getCryptoPrice(cryptoSymbol)
    if (price === 0) {
      return NextResponse.json({ error: "Unable to fetch crypto price" }, { status: 500 })
    }

    const amount = (CLAIM_VALUE_USD / price).toFixed(8)

    // Get user's FaucetPay email
    const faucetPayEmail = await getUserFaucetPayAddress(adminSupabase, user.id, cryptoSymbol)
    if (!faucetPayEmail) {
      return NextResponse.json(
        { error: "Please link your FaucetPay account in settings first" },
        { status: 400 }
      )
    }

    // Get FaucetPay API key for this currency
    const apiKey = await getFaucetPayApiKey(adminSupabase, cryptoSymbol)
    if (!apiKey) {
      return NextResponse.json(
        { error: "FaucetPay not configured for this currency" },
        { status: 500 }
      )
    }

    // Send payment via FaucetPay
    let faucetPayResult = null
    let payoutId = null

    try {
      const faucetPayClient = new FaucetPayClient({
        apiKey,
        currency: cryptoSymbol,
      })

      // Convert amount to satoshis for FaucetPay (they use smallest unit)
      const amountInSmallestUnit = Math.floor(parseFloat(amount) * 100000000)

      faucetPayResult = await faucetPayClient.sendPayment(
        faucetPayEmail,
        amountInSmallestUnit,
        ip,
        false // not a referral
      )

      payoutId = faucetPayResult.payout_id
      console.log("[v0] FaucetPay payment successful:", faucetPayResult)
    } catch (faucetPayError) {
      console.error("[v0] FaucetPay payment failed:", faucetPayError)
      return NextResponse.json(
        { error: faucetPayError instanceof Error ? faucetPayError.message : "FaucetPay payment failed" },
        { status: 500 }
      )
    }

    // Record the claim only after successful FaucetPay payment
    const { error: insertError } = await adminSupabase.from("manual_faucet_claims").insert({
      user_id: user.id,
      crypto_symbol: cryptoSymbol,
      amount: parseFloat(amount),
      usd_value: CLAIM_VALUE_USD,
      ip_address: ip,
      fingerprint: fingerprint?.visitorId || null,
      faucetpay_payout_id: payoutId,
      status: "completed",
    })

    if (insertError) {
      console.error("[v0] Failed to record claim (but payment was sent):", insertError)
      // Don't fail the request since payment was already sent
    }

    return NextResponse.json({
      success: true,
      amount,
      symbol: cryptoSymbol,
      usdValue: CLAIM_VALUE_USD,
      payoutId,
      message: `Sent ${amount} ${cryptoSymbol} to your FaucetPay account!`,
    })
  } catch (error) {
    console.error("Manual faucet claim error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
