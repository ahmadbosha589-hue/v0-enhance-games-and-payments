import { NextRequest, NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { log } from "@/lib/logger"

const CLAIM_VALUE_USD = 0.0001 // $0.0001 per claim
const FAUCETPAY_API_URL = "https://faucetpay.io/api/v1"

// FaucetPay supported currencies - these are the ONLY ones FaucetPay supports
const FAUCETPAY_SUPPORTED_CURRENCIES = [
  "BTC", "LTC", "ETH", "DOGE", "BCH", "DASH", "DGB", "TRX", "FEY", "ZEC",
  "BNB", "SOL", "XRP", "MATIC", "ADA", "TON", "USDT", "SHIB", "USDC"
]

// Get FaucetPay API key - uses a single API key for all currencies
function getFaucetPayApiKey(): string | null {
  return process.env.FAUCETPAY_API_KEY || null
}

// Send FaucetPay payment directly with proper error handling
async function sendFaucetPayPayment(
  apiKey: string,
  toEmail: string,
  amount: number,
  currency: string,
  ipAddress: string
): Promise<{ success: boolean; payoutId?: string; error?: string; balance?: number }> {
  try {
    const formData = new URLSearchParams()
    formData.append("api_key", apiKey)
    formData.append("to", toEmail)
    formData.append("amount", String(amount))
    formData.append("currency", currency)
    formData.append("ip_address", ipAddress)
    formData.append("referral", "false")

    log.info("FaucetPay payment request", {
      to: toEmail,
      amount,
      currency,
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

    log.info("FaucetPay response", { status: result.status, message: result.message })

    // FaucetPay API status codes:
    // 200 = Success
    // 400 = Invalid API key / General error  
    // 401 = Invalid API key
    // 402 = Insufficient funds
    // 403 = Disabled payouts / IP banned
    // 405 = Too many requests (rate limited)
    // 450 = Invalid currency
    // 456 = Invalid to address (email not registered on FaucetPay)
    // 457 = Payout amount too small
    // 458 = Daily limit reached
    // 459 = Referral payout limit reached
    // 460 = User suspended
    // 461 = Wrong currency for this user

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
      450: `${currency} is not supported by FaucetPay.`,
      456: "Your email is not registered on FaucetPay. Please create a FaucetPay account first.",
      457: "Payout amount is too small for FaucetPay minimum.",
      458: "Daily payout limit reached. Please try again tomorrow.",
      459: "Referral payout limit reached.",
      460: "Your FaucetPay account is suspended.",
      461: `Your FaucetPay account cannot receive ${currency}. Please link this currency on FaucetPay.`,
    }

    const errorMessage = errorMessages[result.status] || result.message || "FaucetPay payment failed"

    return { success: false, error: errorMessage }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "FaucetPay request timed out. Please try again." }
    }
    log.error("FaucetPay payment exception", { error })
    return { success: false, error: "Failed to connect to FaucetPay. Please try again." }
  }
}

// Get user's FaucetPay linked email
async function getUserFaucetPayEmail(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{ email: string | null; verified: boolean }> {
  if (!supabase) return { email: null, verified: false }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("faucetpay_email, faucetpay_verified")
      .eq("id", userId)
      .single()

    if (error) {
      log.error("Failed to get user FaucetPay email", { error })
      return { email: null, verified: false }
    }

    return {
      email: data?.faucetpay_email || null,
      verified: data?.faucetpay_verified || false
    }
  } catch {
    return { email: null, verified: false }
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

    // Check if currency is supported by FaucetPay
    if (!FAUCETPAY_SUPPORTED_CURRENCIES.includes(cryptoSymbol)) {
      return NextResponse.json(
        { error: `${cryptoSymbol} is not supported by FaucetPay` },
        { status: 400 }
      )
    }

    // Get user's FaucetPay email
    const { email: faucetPayEmail, verified } = await getUserFaucetPayEmail(adminSupabase, user.id)

    if (!faucetPayEmail) {
      return NextResponse.json(
        { error: "Please link your FaucetPay account in settings first" },
        { status: 400 }
      )
    }

    // Get FaucetPay API key
    const apiKey = getFaucetPayApiKey()
    if (!apiKey) {
      log.error("FAUCETPAY_API_KEY not configured")
      return NextResponse.json(
        { error: "FaucetPay is not configured. Please contact support." },
        { status: 500 }
      )
    }

    // Convert amount to satoshis/smallest unit for FaucetPay
    const amountInSmallestUnit = Math.floor(parseFloat(amount) * 100000000)

    // Check minimum payout (FaucetPay has minimums per currency)
    if (amountInSmallestUnit < 1) {
      return NextResponse.json(
        { error: "Amount too small for FaucetPay minimum" },
        { status: 400 }
      )
    }

    // Send payment via FaucetPay
    const paymentResult = await sendFaucetPayPayment(
      apiKey,
      faucetPayEmail,
      amountInSmallestUnit,
      cryptoSymbol,
      ip
    )

    if (!paymentResult.success) {
      log.error("FaucetPay payment failed", {
        error: paymentResult.error,
        email: faucetPayEmail,
        currency: cryptoSymbol
      })
      return NextResponse.json(
        { error: paymentResult.error || "FaucetPay payment failed" },
        { status: 400 }
      )
    }

    log.info("FaucetPay payment successful", {
      payoutId: paymentResult.payoutId,
      amount: amountInSmallestUnit,
      currency: cryptoSymbol
    })

    // Record the claim only after successful FaucetPay payment
    // Note: Use faucetpay_tx_id column as that's what the table has
    const { error: insertError } = await adminSupabase.from("manual_faucet_claims").insert({
      user_id: user.id,
      crypto_symbol: cryptoSymbol,
      amount: parseFloat(amount),
      usd_value: CLAIM_VALUE_USD,
      ip_address: ip,
      fingerprint: fingerprint?.visitorId || null,
      faucetpay_tx_id: paymentResult.payoutId, // Use correct column name
      status: "completed",
    })

    if (insertError) {
      log.error("Failed to record claim (but payment was sent)", { error: insertError })
      // Don't fail the request since payment was already sent
    }

    return NextResponse.json({
      success: true,
      amount,
      symbol: cryptoSymbol,
      usdValue: CLAIM_VALUE_USD,
      payoutId: paymentResult.payoutId,
      message: `Sent ${amount} ${cryptoSymbol} to your FaucetPay account!`,
    })
  } catch (error) {
    console.error("Manual faucet claim error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
