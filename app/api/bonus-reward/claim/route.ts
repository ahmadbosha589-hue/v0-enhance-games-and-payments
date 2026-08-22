import { NextRequest, NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"
import { isRewardedAdsEnabled } from "@/lib/rewards/rewarded-ads"
import { headers } from "next/headers"
import { log } from "@/lib/logger"

// Rate limit: 10 bonus claims per hour per user
const BONUS_RATE_LIMIT = 10
const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour in ms

// In-memory rate limiting (use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

type BonusType =
  | "shortlink_double"
  | "coupon_double"
  | "ptc_5x"
  | "faucet_double"
  | "manual_faucet_double"
  | "faucet"
  | "faucet_claim"
  | "manual_faucet"
  | "daily_bonus"
  | "shortlink"
  | "coupon"
  | "ptc_milestone"
  | "game"

const VALID_TYPES: BonusType[] = [
  "shortlink_double",
  "coupon_double",
  "ptc_5x",
  "faucet_double",
  "manual_faucet_double",
  "faucet",
  "faucet_claim",
  "manual_faucet",
  "daily_bonus",
  "shortlink",
  "coupon",
  "ptc_milestone",
  "game"
]

const TYPE_TRANSACTION_MAP: Record<BonusType, string> = {
  shortlink_double: "shortlink_bonus",
  coupon_double: "coupon_bonus",
  ptc_5x: "ptc_bonus",
  faucet_double: "faucet_bonus",
  manual_faucet_double: "manual_faucet_bonus",
  faucet: "faucet_bonus",
  faucet_claim: "faucet_bonus",
  manual_faucet: "manual_faucet_bonus",
  daily_bonus: "daily_bonus_bonus",
  shortlink: "shortlink_bonus",
  coupon: "coupon_bonus",
  ptc_milestone: "ptc_milestone_bonus",
  game: "game_bonus"
}

export async function POST(request: NextRequest) {
  // Config-gated: enabled only when a real rewarded-ad provider is wired up.
  // Without one there is no ad inventory and no server-side watch proof.
  if (!isRewardedAdsEnabled()) {
    return NextResponse.json({
      error: "Verified rewarded-ad inventory is not enabled for this deployment",
    }, { status: 503 })
  }

  try {
    // Get user
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    // Rate limiting check
    const now = Date.now()
    const userRateLimit = rateLimitMap.get(user.id)

    if (userRateLimit) {
      if (now < userRateLimit.resetAt) {
        if (userRateLimit.count >= BONUS_RATE_LIMIT) {
          const retryAfter = Math.ceil((userRateLimit.resetAt - now) / 1000)
          return NextResponse.json(
            { error: "Too many bonus claims. Please try again later." },
            { status: 429, headers: { "Retry-After": String(retryAfter) } }
          )
        }
        userRateLimit.count++
      } else {
        rateLimitMap.set(user.id, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
      }
    } else {
      rateLimitMap.set(user.id, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    }

    // Parse request body
    const body = await request.json()
    const { type, baseAmount, multiplier = 2, cryptoSymbol } = body

    // Validate type
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid bonus type" }, { status: 400 })
    }

    // Validate base amount
    if (typeof baseAmount !== "number" || baseAmount <= 0 || baseAmount > 100000) {
      return NextResponse.json({ error: "Invalid base amount" }, { status: 400 })
    }

    // Validate multiplier
    if (typeof multiplier !== "number" || multiplier < 2 || multiplier > 10) {
      return NextResponse.json({ error: "Invalid multiplier" }, { status: 400 })
    }

    // Calculate bonus
    const bonusAmount = Math.floor(baseAmount * (multiplier - 1))

    // Get IP for logging
    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0] || "unknown"

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    // Check for recent bonus claim to prevent abuse (10 minute cooldown per type)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: recentClaim } = await adminSupabase
      .from("transactions")
      .select("id")
      .eq("user_id", user.id)
      .eq("type", TYPE_TRANSACTION_MAP[type as BonusType])
      .gte("created_at", tenMinutesAgo)
      .limit(1)
      .single()

    if (recentClaim) {
      return NextResponse.json(
        { error: "Please wait before claiming another bonus of this type" },
        { status: 429 }
      )
    }

    // Get user profile
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("balance_satoshis")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      log.error("Profile fetch error", { userId: user.id, error: profileError })
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 })
    }

    // Update user balance
    const newBalance = (profile.balance_satoshis || 0) + bonusAmount

    const { error: updateError } = await adminSupabase
      .from("profiles")
      .update({ balance_satoshis: newBalance })
      .eq("id", user.id)

    if (updateError) {
      log.error("Balance update error", { userId: user.id, error: updateError })
      return NextResponse.json({ error: "Failed to update balance" }, { status: 500 })
    }

    // Record transaction
    await adminSupabase.from("transactions").insert({
      user_id: user.id,
      type: TYPE_TRANSACTION_MAP[type as BonusType],
      amount: bonusAmount,
      status: "completed",
      description: `${multiplier}x bonus from watching ads (${type})`,
      metadata: {
        bonus_type: type,
        base_amount: baseAmount,
        multiplier,
        crypto_symbol: cryptoSymbol || null,
        ip
      }
    })

    // Update support stats for tournament tracking
    const { data: existingStats } = await adminSupabase
      .from("support_stats")
      .select("ads_watched_today, total_ads_watched, total_support_earnings")
      .eq("user_id", user.id)
      .single()

    if (existingStats) {
      await adminSupabase.from("support_stats").update({
        ads_watched_today: (existingStats.ads_watched_today || 0) + 3,
        total_ads_watched: (existingStats.total_ads_watched || 0) + 3,
        total_support_earnings: (existingStats.total_support_earnings || 0) + bonusAmount,
        updated_at: new Date().toISOString()
      }).eq("user_id", user.id)
    } else {
      await adminSupabase.from("support_stats").insert({
        user_id: user.id,
        ads_watched_today: 3,
        total_ads_watched: 3,
        total_support_earnings: bonusAmount,
        updated_at: new Date().toISOString()
      }).then(undefined, () => {
        // Table might not exist yet
      })
    }

    log.info("Bonus reward claimed", {
      userId: user.id,
      type,
      baseAmount,
      multiplier,
      bonusAmount,
      cryptoSymbol,
      ip
    })

    return NextResponse.json({
      success: true,
      bonusAmount,
      totalAmount: baseAmount + bonusAmount,
      newBalance,
      multiplier
    })

  } catch (error) {
    log.error("Bonus reward error", { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
