import { NextRequest, NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { log } from "@/lib/logger"
import { validateClaimRequest, type ClaimContext } from "@/lib/security/anti-drain-protection"
import { checkAntiDrain, recordClaim } from "@/lib/redis/anti-drain"
import { checkRateLimit, RATE_LIMITS } from "@/lib/redis/rate-limiter"
import { randomUUID } from "node:crypto"
import { checkCooldown, setCooldown, COOLDOWNS } from "@/lib/redis/cooldowns"

const CLAIM_VALUE_USD = 0.0009 // $0.0009 per claim
const FAUCETPAY_API_URL = "https://faucetpay.io/api/v1"

// FaucetPay supported currencies - these are the ONLY ones FaucetPay supports
const FAUCETPAY_SUPPORTED_CURRENCIES = [
  "BTC", "LTC", "ETH", "DOGE", "BCH", "DASH", "DGB", "TRX", "FEY", "ZEC",
  "BNB", "SOL", "XRP", "MATIC", "ADA", "TON", "USDT", "SHIB", "USDC"
]

// Get FaucetPay API key - uses a single API key for all currencies
// Resolves FaucetPay API key: DB (admin-configured) takes priority over env var
async function getFaucetPayApiKey(db?: ReturnType<typeof createAdminClient>): Promise<string | null> {
  // Try DB first so admins can rotate keys without redeploying
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

// Get user's FaucetPay linked email - with detailed error handling
async function getUserFaucetPayEmail(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{ email: string | null; verified: boolean; error?: string }> {
  if (!supabase) return { email: null, verified: false, error: "Database not available" }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("faucetpay_email, faucetpay_verified")
      .eq("id", userId)
      .single()

    if (error) {
      log.error("Failed to get user FaucetPay email", { error, userId })
      // Check for specific error types
      if (error.code === "PGRST116") {
        return { email: null, verified: false, error: "Profile not found" }
      }
      if (error.message?.includes("faucetpay_email")) {
        return { email: null, verified: false, error: "FaucetPay column not configured in database" }
      }
      return { email: null, verified: false, error: `Database error: ${error.message}` }
    }

    if (!data) {
      return { email: null, verified: false, error: "Profile data not found" }
    }

    return {
      email: data.faucetpay_email || null,
      verified: data.faucetpay_verified || false
    }
  } catch (err) {
    log.error("Exception getting FaucetPay email", { err, userId })
    return { email: null, verified: false, error: "Failed to fetch profile" }
  }
}
const COOLDOWN_SECONDS = 60 // 60 seconds (1 minute) between claims per crypto
const SHORTLINK_REQUIRED_AFTER = 100 // After 100 claims, require a shortlink

// CoinGecko IDs mapping
const COINGECKO_IDS: Record<string, string> = {
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
  BTC: "bitcoin",
  XRP: "ripple",
  ADA: "cardano",
  TON: "the-open-network",
}

// In-memory price cache with TTL
let priceCache: Record<string, { price: number; timestamp: number }> = {}
const CACHE_TTL_MS = 60000 // 1 minute cache

// Get crypto price with a short-lived cache; no synthetic market prices
async function getCryptoPrice(symbol: string): Promise<number> {
  const geckoId = COINGECKO_IDS[symbol]
  if (!geckoId) return 0

  // Check cache first
  const cached = priceCache[symbol]
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.price
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
      {
        signal: controller.signal,
        headers: { "Accept": "application/json" },
        next: { revalidate: 60 }
      }
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`CoinGecko returned ${response.status}`)
    }

    const data = await response.json()
    const price = data[geckoId]?.usd

    if (typeof price === 'number' && price > 0) {
      // Update cache
      priceCache[symbol] = { price, timestamp: Date.now() }
      return price
    }

    // Price not found or invalid; the claim path will reject zero pricing.
    return 0
  } catch (error) {
    if (cached) return cached.price
    log.warn("CoinGecko fetch failed; live price unavailable", { symbol, error: String(error) })
    return 0
  }
}

// Calculate crypto amount from USD value
function calculateCryptoAmount(usdValue: number, pricePerCoin: number): number {
  if (pricePerCoin <= 0) return 0
  return usdValue / pricePerCoin
}

// Format crypto amount to appropriate precision (no scientific notation)
function formatCryptoAmount(amount: number, symbol: string): string {
  if (amount <= 0) return "0"

  // Most cryptos use 8 decimal places (satoshi precision)
  // Always use toFixed to avoid scientific notation like 1.5e-7
  const decimals = amount < 0.00000001 ? 10 : 8
  const fixed = amount.toFixed(decimals)

  // Remove trailing zeros but keep meaningful precision
  return fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') || "0"
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

    // Get user profile with detailed error handling
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (profileError) {
      log.error("Profile fetch error", { error: profileError, userId: user.id })
      return NextResponse.json({
        error: "Unable to load your profile. Please refresh and try again.",
        detail: profileError.message
      }, { status: 500 })
    }

    if (!profile) {
      log.error("Profile not found", { userId: user.id })
      return NextResponse.json({ error: "Profile not found. Please contact support." }, { status: 404 })
    }

    log.info("Profile loaded for claim", {
      userId: user.id,
      hasFaucetPayEmail: !!profile.faucetpay_email,
      faucetpayVerified: profile.faucetpay_verified
    })

    // Check if user is active
    if (profile.status !== "active") {
      return NextResponse.json({ error: "Account is not active" }, { status: 403 })
    }
    if (profile.faucetpay_verified !== true) {
      return NextResponse.json({
        error: "Verify your FaucetPay account in Settings before requesting a payout",
        code: "FAUCETPAY_NOT_VERIFIED",
      }, { status: 403 })
    }

    const ptcTodayStart = new Date()
    ptcTodayStart.setUTCHours(0, 0, 0, 0)
    const { count: completedPtcToday, error: ptcStatusError } = await adminSupabase
      .from("ptc_views")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("completed", true)
      .gte("created_at", ptcTodayStart.toISOString())

    if (ptcStatusError) {
      log.error("PTC unlock check failed", { userId: user.id, error: ptcStatusError })
      return NextResponse.json({ error: "PTC unlock status is temporarily unavailable" }, { status: 503 })
    }
    if ((completedPtcToday ?? 0) < 3) {
      return NextResponse.json({
        error: "Complete 3 PTC ads today to unlock the direct faucet",
        completedToday: completedPtcToday ?? 0,
        required: 3,
      }, { status: 403 })
    }

    // Check for VPN/fraud
    if (profile.is_flagged && profile.fraud_score >= 70) {
      return NextResponse.json({ error: "Account under review" }, { status: 403 })
    }

    // Get IP address and request headers for security validation
    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0] ||
      headersList.get("x-real-ip") ||
      "unknown"
    const userAgent = headersList.get("user-agent") || ""

    // Collect all headers for analysis
    const requestHeaders: Record<string, string> = {}
    headersList.forEach((value, key) => {
      requestHeaders[key] = value
    })

    // =========================================================================
    // REDIS-BACKED RATE LIMITING (works across serverless instances)
    // =========================================================================
    const rateLimitResult = await checkRateLimit(`${user.id}:${cryptoSymbol}`, RATE_LIMITS.MANUAL_FAUCET)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: `Too many claims. Try again in ${rateLimitResult.retryAfter} seconds.`,
          retryAfter: rateLimitResult.retryAfter
        },
        { status: 429 }
      )
    }

    // =========================================================================
    // REDIS-BACKED COOLDOWN (per crypto, 60 seconds)
    // =========================================================================
    const cooldownResult = await checkCooldown(`${user.id}:${cryptoSymbol}`, COOLDOWNS.MANUAL_FAUCET)
    if (cooldownResult.onCooldown) {
      return NextResponse.json(
        {
          error: "Cooldown active",
          cooldownRemaining: cooldownResult.remainingSeconds
        },
        { status: 429 }
      )
    }

    // =========================================================================
    // REDIS-BACKED ANTI-DRAIN PROTECTION (tracks across all instances)
    // =========================================================================
    const redisAntiDrainResult = await checkAntiDrain({
      userId: user.id,
      ip,
      deviceFingerprint: fingerprint?.visitorId,
      claimAmount: 1, // We'll update with actual amount after calculation
      claimType: `manual_faucet_${cryptoSymbol}`,
    })

    if (!redisAntiDrainResult.allowed) {
      log.warn("Redis anti-drain blocked claim", {
        userId: user.id,
        ip,
        reason: redisAntiDrainResult.reason,
        riskScore: redisAntiDrainResult.riskScore,
        flags: redisAntiDrainResult.flags
      })

      return NextResponse.json(
        {
          error: redisAntiDrainResult.reason || "Request blocked for security reasons",
          code: "SECURITY_BLOCK"
        },
        { status: 429 }
      )
    }

    // =========================================================================
    // LEGACY ANTI-DRAIN PROTECTION - Multi-layer security validation (backup)
    // =========================================================================
    const claimContext: ClaimContext = {
      userId: user.id,
      ip,
      userAgent,
      fingerprint: fingerprint?.visitorId,
      captchaToken,
      timestamp: Date.now(),
      cryptoSymbol,
      requestHeaders
    }

    const antiDrainResult = await validateClaimRequest(claimContext)

    if (!antiDrainResult.isAllowed) {
      log.warn("Legacy anti-drain protection blocked claim", {
        userId: user.id,
        ip,
        reason: antiDrainResult.reason,
        riskScore: antiDrainResult.riskScore,
        factors: antiDrainResult.suspiciousFactors
      })

      return NextResponse.json(
        {
          error: antiDrainResult.reason || "Request blocked for security reasons",
          code: "SECURITY_BLOCK",
          retryAfter: antiDrainResult.blockDuration
        },
        {
          status: 429,
          headers: antiDrainResult.blockDuration
            ? { "Retry-After": String(antiDrainResult.blockDuration) }
            : undefined
        }
      )
    }

    // Log if risk score is elevated (but still allowed)
    if (antiDrainResult.riskScore > 30 || redisAntiDrainResult.riskScore > 30) {
      log.warn("Elevated risk claim allowed", {
        userId: user.id,
        riskScore: Math.max(antiDrainResult.riskScore, redisAntiDrainResult.riskScore),
        factors: antiDrainResult.suspiciousFactors,
        redisFlags: redisAntiDrainResult.flags
      })
    }

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

    // Get crypto price and calculate amount - ROBUST with fallback
    const price = await getCryptoPrice(cryptoSymbol)
    if (price <= 0) {
      log.error("Failed to get crypto price", { symbol: cryptoSymbol })
      return NextResponse.json({
        error: "Unable to fetch crypto price. Please try again.",
        code: "PRICE_FETCH_FAILED"
      }, { status: 500 })
    }

    // Calculate the crypto amount based on USD value
    const cryptoAmount = calculateCryptoAmount(CLAIM_VALUE_USD, price)
    if (cryptoAmount <= 0) {
      return NextResponse.json({
        error: "Invalid amount calculated. Please try again.",
        code: "INVALID_AMOUNT"
      }, { status: 500 })
    }

    const amount = formatCryptoAmount(cryptoAmount, cryptoSymbol)

    log.info("Calculated claim amount", {
      symbol: cryptoSymbol,
      usdValue: CLAIM_VALUE_USD,
      price,
      cryptoAmount,
      formattedAmount: amount
    })

    // Check if currency is supported by FaucetPay
    if (!FAUCETPAY_SUPPORTED_CURRENCIES.includes(cryptoSymbol)) {
      return NextResponse.json(
        { error: `${cryptoSymbol} is not supported by FaucetPay` },
        { status: 400 }
      )
    }

    // Get FaucetPay email - robust 3-level fallback chain
    // Fix: trim whitespace, treat empty string as missing (common save bug)
    let faucetPayEmail: string | null = (profile.faucetpay_email || "").trim() || null

    // Fallback 1: direct fresh DB fetch in case profile was cached/stale
    if (!faucetPayEmail) {
      try {
        const { data: freshProfile } = await adminSupabase
          .from("profiles")
          .select("faucetpay_email")
          .eq("id", user.id)
          .single()
        faucetPayEmail = (freshProfile?.faucetpay_email || "").trim() || null
        if (faucetPayEmail) log.info("FaucetPay email found on re-fetch", { userId: user.id })
      } catch { /* continue to fallback 2 */ }
    }

    // Fallback 2: dedicated helper function
    if (!faucetPayEmail) {
      const fp = await getUserFaucetPayEmail(adminSupabase, user.id)
      faucetPayEmail = (fp.email || "").trim() || null
    }

    if (faucetPayEmail) {
      log.info("FaucetPay email resolved", { verified: profile.faucetpay_verified })
    }

    if (!faucetPayEmail) {
      log.warn("FaucetPay email missing", {
        userId: user.id,
        profileEmail: profile.faucetpay_email,
        profileVerified: profile.faucetpay_verified
      })

      const errorMessage = "FaucetPay email not found. Please go to Settings → Payment Settings and save your FaucetPay email again."
      const detailMessage = "If you already saved it, try removing and re-entering your FaucetPay email in Account Settings."

      return NextResponse.json(
        {
          error: errorMessage,
          detail: detailMessage,
          action: "settings",
          code: "FAUCETPAY_NOT_CONFIGURED"
        },
        { status: 400 }
      )
    }

    // Double check the email is valid format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(faucetPayEmail.trim())) {
      return NextResponse.json(
        {
          error: "Invalid FaucetPay email format",
          detail: "Please update your FaucetPay email in Settings with a valid email address",
          code: "INVALID_EMAIL"
        },
        { status: 400 }
      )
    }

    // Get FaucetPay API key — DB-configured key takes priority over env var
    const apiKey = await getFaucetPayApiKey(adminSupabase)
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

    const requestId = headersList.get("idempotency-key")?.trim() || randomUUID()
    const { data: reservation, error: reservationError } = await adminSupabase.rpc("reserve_manual_faucet_claim", {
      p_user_id: user.id,
      p_crypto_symbol: cryptoSymbol,
      p_amount: parseFloat(amount),
      p_usd_value: CLAIM_VALUE_USD,
      p_request_id: requestId,
      p_ip_address: ip,
      p_fingerprint: fingerprint?.visitorId || null,
    })

    if (reservationError || !reservation) {
      log.error("Manual faucet reservation failed", { userId: user.id, error: reservationError })
      return NextResponse.json({ error: "Payout reservation service is temporarily unavailable" }, { status: 503 })
    }
    if (!reservation.success) {
      return NextResponse.json({
        error: reservation.message || "A previous payout is still being processed",
        code: reservation.error,
      }, { status: reservation.error === "COOLDOWN_ACTIVE" ? 429 : 409 })
    }

    const manualClaimId = reservation.claim_id

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
      try {
        await adminSupabase.rpc("finalize_manual_faucet_claim", {
          p_claim_id: manualClaimId,
          p_user_id: user.id,
          p_status: "failed",
          p_provider_tx_id: null,
        })
      } catch { /* preserve the pending reservation for reconciliation */ }
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

    const { data: finalized, error: finalizeError } = await adminSupabase.rpc("finalize_manual_faucet_claim", {
      p_claim_id: manualClaimId,
      p_user_id: user.id,
      p_status: "completed",
      p_provider_tx_id: paymentResult.payoutId || null,
    })

    if (finalizeError || !finalized?.success) {
      log.error("Failed to finalize manual faucet claim after provider success", {
        userId: user.id,
        claimId: manualClaimId,
        payoutId: paymentResult.payoutId,
        error: finalizeError,
      })
      return NextResponse.json({
        error: "Payout was sent but reconciliation is pending. Contact support before retrying.",
        code: "PAYOUT_RECONCILIATION_REQUIRED",
      }, { status: 503 })
    }

    await setCooldown(`${user.id}:${cryptoSymbol}`, COOLDOWNS.MANUAL_FAUCET)

    // Record claim in Redis for anti-drain tracking
    await recordClaim({
      userId: user.id,
      ip,
      deviceFingerprint: fingerprint?.visitorId,
      claimAmount: amountInSmallestUnit,
      claimType: `manual_faucet_${cryptoSymbol}`,
    })

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
