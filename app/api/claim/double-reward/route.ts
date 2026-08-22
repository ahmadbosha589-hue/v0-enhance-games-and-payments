import { NextRequest, NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { log } from "@/lib/logger"
import { checkAndSetCooldown, checkDailyLimit, incrementDailyUsage, COOLDOWNS } from "@/lib/redis/cooldowns"
import { checkRateLimit, RATE_LIMITS } from "@/lib/redis/rate-limiter"
import { isRewardedAdsEnabled } from "@/lib/rewards/rewarded-ads"


// Max double rewards per day per user
const MAX_DOUBLE_REWARDS_PER_DAY = 10

export async function POST(request: NextRequest) {
  if (!isRewardedAdsEnabled()) {
    return NextResponse.json({
      error: "Verified rewarded-ad inventory is not enabled for this deployment",
    }, { status: 503 })
  }
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { baseAmount } = body

    if (!baseAmount || typeof baseAmount !== "number" || baseAmount <= 0) {
      return NextResponse.json({ error: "Invalid base amount" }, { status: 400 })
    }

    // Get IP for rate limiting and logging
    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0] ||
      headersList.get("x-real-ip") ||
      "unknown"

    // ═══════════════════════════════════════════════════════════════════════
    // REDIS-BACKED RATE LIMITING (prevents spam even across serverless instances)
    // ═══════════════════════════════════════════════════════════════════════

    // Check rate limit (5 per hour)
    const rateLimitResult = await checkRateLimit(`${user.id}:${ip}`, RATE_LIMITS.DOUBLE_REWARD)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Try again in ${rateLimitResult.retryAfter} seconds.`,
          retryAfter: rateLimitResult.retryAfter
        },
        { status: 429 }
      )
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REDIS-BACKED COOLDOWN (10 minute cooldown between double rewards)
    // ═══════════════════════════════════════════════════════════════════════

    const cooldownResult = await checkAndSetCooldown(user.id, COOLDOWNS.DOUBLE_REWARD)
    if (!cooldownResult.allowed) {
      const minutes = Math.floor(cooldownResult.remainingSeconds / 60)
      const seconds = cooldownResult.remainingSeconds % 60
      return NextResponse.json(
        {
          error: `Please wait ${minutes}m ${seconds}s before claiming another double reward`,
          remainingSeconds: cooldownResult.remainingSeconds
        },
        { status: 429 }
      )
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DAILY LIMIT CHECK (max 10 double rewards per day)
    // ═══════════════════════════════════════════════════════════════════════

    const dailyLimit = await checkDailyLimit(user.id, MAX_DOUBLE_REWARDS_PER_DAY, "double_reward")
    if (!dailyLimit.allowed) {
      return NextResponse.json(
        {
          error: `Daily limit reached (${MAX_DOUBLE_REWARDS_PER_DAY} double rewards per day). Try again tomorrow.`,
          used: dailyLimit.used,
          limit: MAX_DOUBLE_REWARDS_PER_DAY
        },
        { status: 429 }
      )
    }

    const supabase = await createAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
    }

    // Verify user has recent claim
    const { data: recentClaim } = await supabase
      .from("claims")
      .select("id, amount_satoshis, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (!recentClaim) {
      return NextResponse.json(
        { error: "No recent claim found. Please claim first." },
        { status: 400 }
      )
    }

    // Check if claim was within last 5 minutes
    const claimAge = Date.now() - new Date(recentClaim.created_at).getTime()
    if (claimAge > 5 * 60 * 1000) {
      return NextResponse.json(
        { error: "Your last claim has expired. Please make a new claim first." },
        { status: 400 }
      )
    }

    // Verify base amount matches recent claim (with small tolerance)
    if (Math.abs(recentClaim.amount_satoshis - baseAmount) > 1) {
      return NextResponse.json(
        { error: "Amount mismatch. Please try again." },
        { status: 400 }
      )
    }

    // Check for double reward already claimed for this claim
    const { data: existingDouble } = await supabase
      .from("double_reward_claims")
      .select("id")
      .eq("original_claim_id", recentClaim.id)
      .single()

    if (existingDouble) {
      return NextResponse.json(
        { error: "Double reward already claimed for this claim" },
        { status: 400 }
      )
    }

    const doubleAmount = baseAmount

    // Update user balance
    const { error: balanceError } = await supabase.rpc("increment_balance", {
      user_id: user.id,
      amount: doubleAmount
    })

    if (balanceError) {
      log.error("Atomic double-reward balance RPC failed", { userId: user.id, error: balanceError })
      return NextResponse.json({ error: "Double reward service is temporarily unavailable" }, { status: 503 })
    }

    // Record the transaction
    await supabase.from("transactions").insert({
      user_id: user.id,
      type: "double_reward",
      amount: doubleAmount,
      status: "completed",
      description: `Double reward for faucet claim (watched 3 ads)`,
      metadata: {
        original_claim_id: recentClaim.id,
        original_amount: baseAmount,
        ip_address: ip
      }
    })

    // Record double reward claim
    await supabase.from("double_reward_claims").insert({
      user_id: user.id,
      original_claim_id: recentClaim.id,
      original_amount: baseAmount,
      bonus_amount: doubleAmount,
      claim_type: "faucet"
    }).then(undefined, () => {
      // Table might not exist yet
    })

    // Track for support tournament
    const { data: existingStats } = await supabase
      .from("support_stats")
      .select("ads_watched_today, total_ads_watched, total_support_earnings")
      .eq("user_id", user.id)
      .single()

    if (existingStats) {
      await supabase.from("support_stats").update({
        ads_watched_today: (existingStats.ads_watched_today || 0) + 3,
        total_ads_watched: (existingStats.total_ads_watched || 0) + 3,
        total_support_earnings: (existingStats.total_support_earnings || 0) + doubleAmount,
        updated_at: new Date().toISOString()
      }).eq("user_id", user.id).then(undefined, () => { })
    } else {
      await supabase.from("support_stats").insert({
        user_id: user.id,
        ads_watched_today: 3,
        total_ads_watched: 3,
        total_support_earnings: doubleAmount,
        updated_at: new Date().toISOString()
      }).then(undefined, () => { })
    }

    // Increment daily usage counter in Redis
    await incrementDailyUsage(user.id, "double_reward")

    log.info("Double reward claimed (faucet)", {
      userId: user.id,
      originalAmount: baseAmount,
      bonusAmount: doubleAmount,
      dailyUsed: dailyLimit.used + 1,
      ip
    })

    return NextResponse.json({
      success: true,
      amount: doubleAmount,
      dailyRemaining: MAX_DOUBLE_REWARDS_PER_DAY - dailyLimit.used - 1,
      message: "Double reward claimed successfully!"
    })

  } catch (error) {
    log.error("Double reward error:", error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json(
      { error: "Failed to process double reward" },
      { status: 500 }
    )
  }
}
