import { NextRequest, NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { log } from "@/lib/logger"

// Rate limit: 1 double reward per 10 minutes per user
const DOUBLE_REWARD_COOLDOWN_MS = 10 * 60 * 1000
const doubleRewardCooldowns = new Map<string, number>()

export async function POST(request: NextRequest) {
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

    // Rate limit check
    const now = Date.now()
    const lastDoubleReward = doubleRewardCooldowns.get(user.id) || 0
    if (now - lastDoubleReward < DOUBLE_REWARD_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((DOUBLE_REWARD_COOLDOWN_MS - (now - lastDoubleReward)) / 1000)
      return NextResponse.json(
        { error: `Please wait ${remainingSeconds}s before claiming another double reward` },
        { status: 429 }
      )
    }

    // Get IP for logging
    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for")?.split(",")[0] ||
      headersList.get("x-real-ip") ||
      "unknown"

    const supabase = await createAdminClient()

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
      // Fallback: direct update
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance_satoshis")
        .eq("id", user.id)
        .single()

      if (profile) {
        await supabase
          .from("profiles")
          .update({
            balance_satoshis: profile.balance_satoshis + doubleAmount,
            total_earned_satoshis: profile.balance_satoshis + doubleAmount
          })
          .eq("id", user.id)
      }
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
    }).catch(() => {
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
      }).eq("user_id", user.id).catch(() => { })
    } else {
      await supabase.from("support_stats").insert({
        user_id: user.id,
        ads_watched_today: 3,
        total_ads_watched: 3,
        total_support_earnings: doubleAmount,
        updated_at: new Date().toISOString()
      }).catch(() => { })
    }

    // Update cooldown
    doubleRewardCooldowns.set(user.id, now)

    log.info("Double reward claimed (faucet)", {
      userId: user.id,
      originalAmount: baseAmount,
      bonusAmount: doubleAmount,
      ip
    })

    return NextResponse.json({
      success: true,
      amount: doubleAmount,
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
