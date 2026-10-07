import { NextResponse } from "next/server"
import { getUser, getProfile, createAdminClient } from "@/lib/supabase/server"
import { getFaucetPayClient } from "@/lib/faucetpay/client"
import { logger } from "@/lib/logger"

export async function POST(request: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const profile = await getProfile(user.id)
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    if (!profile.faucetpay_email) {
      return NextResponse.json({
        error: "Please link your FaucetPay email in Settings",
        code: "FAUCETPAY_NOT_CONFIGURED"
      }, { status: 400 })
    }

    const body = await request.json()
    const { cryptoSymbol, baseAmount } = body

    if (!cryptoSymbol || typeof baseAmount !== "number" || baseAmount <= 0) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    // Calculate double reward
    const doubleAmount = baseAmount * 2

    // Get FaucetPay client and send the double reward
    const faucetPay = getFaucetPayClient()
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"

    faucetPay.setCurrency(cryptoSymbol.toUpperCase())
    const result = await faucetPay.sendPayment(
      profile.faucetpay_email,
      doubleAmount,
      ipAddress,
    )

    if (result.status !== 200) {
      logger.warn("Double reward failed", {
        userId: user.id,
        symbol: cryptoSymbol,
        amount: doubleAmount,
        error: result.message
      })
      return NextResponse.json({
        error: result.message || "FaucetPay payment failed"
      }, { status: 400 })
    }

    // Log the double reward claim
    const supabase = createAdminClient()
    const { error: claimLogError } = await supabase.from("double_reward_claims").insert({
      user_id: user.id,
      crypto_symbol: cryptoSymbol,
      base_amount: baseAmount,
      double_amount: doubleAmount,
      ads_watched: 3,
      created_at: new Date().toISOString()
    })

    if (claimLogError) {
      logger.warn("Double reward claim log failed", {
        userId: user.id,
        error: claimLogError.message,
      })
    }

    // Track for support tournament - increment values
    const { data: existingStats } = await supabase
      .from("support_stats")
      .select("ads_watched_today, total_ads_watched, total_support_earnings")
      .eq("user_id", user.id)
      .single()

    if (existingStats) {
      const { error: supportStatsUpdateError } = await supabase.from("support_stats").update({
        ads_watched_today: (existingStats.ads_watched_today || 0) + 3,
        total_ads_watched: (existingStats.total_ads_watched || 0) + 3,
        total_support_earnings: (existingStats.total_support_earnings || 0) + doubleAmount,
        updated_at: new Date().toISOString()
      }).eq("user_id", user.id)

      if (supportStatsUpdateError) {
        logger.warn("Support stats update failed", {
          userId: user.id,
          error: supportStatsUpdateError.message,
        })
      }
    } else {
      const { error: supportStatsInsertError } = await supabase.from("support_stats").insert({
        user_id: user.id,
        ads_watched_today: 3,
        total_ads_watched: 3,
        total_support_earnings: doubleAmount,
        updated_at: new Date().toISOString()
      })

      if (supportStatsInsertError) {
        logger.warn("Support stats insert failed", {
          userId: user.id,
          error: supportStatsInsertError.message,
        })
      }
    }

    logger.info("Double reward claimed", {
      userId: user.id,
      symbol: cryptoSymbol,
      amount: doubleAmount
    })

    return NextResponse.json({
      success: true,
      amount: result.payout_user_hash || doubleAmount,
      currency: cryptoSymbol
    })

  } catch (error) {
    logger.error("Double reward error", error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json({ error: "Failed to process double reward" }, { status: 500 })
  }
}
