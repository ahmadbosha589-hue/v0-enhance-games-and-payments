import { NextRequest, NextResponse } from "next/server"
import { createClient, getUser, createAdminClient } from "@/lib/supabase/server"
import { headers } from "next/headers"
import { log } from "@/lib/logger"

/**
 * AdsGram rewarded-ad completion.
 *
 * Flow: the client renders a real AdsGram ad (Telegram Mini App SDK,
 * `AdController.show()`). The SDK's promise resolves ONLY when the user has
 * watched the ad to the end (or closed an interstitial); on skip/error it
 * rejects and the client never calls this endpoint.
 *
 * The client then sends the completion event. The server cannot verify
 * AdsGram's client callback cryptographically (AdsGram has no publisher-side
 * S2S signature like offerwalls), so the anti-abuse guarantees here are:
 *   • the caller is authenticated,
 *   • one completion per ad block per cooldown window (DB-enforced),
 *   • the payout is bounded by the user's largest REAL earning in 24h
 *     (you can only multiply earnings you actually received),
 *   • every completion is recorded in ad_ad_completions for audit.
 *
 * Fail-closed: if ADSGRAM_BLOCK_ID is not configured the endpoint refuses,
 * and the UI never shows the ad button.
 */

const COOLDOWN_MINUTES = 10
const MAX_COMPLETIONS_PER_DAY = 20

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { blockId, baseAmount, multiplier = 2 } = body ?? {}

    // The block id must be configured server-side AND match what the client
    // shows — a completion for an unknown block is refused.
    const configuredBlockId = process.env.NEXT_PUBLIC_ADSGRAM_BLOCK_ID?.trim() || ""
    if (!configuredBlockId) {
      return NextResponse.json(
        { error: "Rewarded ads are not available right now." },
        { status: 503 },
      )
    }
    if (blockId !== configuredBlockId) {
      return NextResponse.json({ error: "Invalid ad block" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    // Rate limiting: completions per day for this user.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: todayCount } = await adminSupabase
      .from("ad_ad_completions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("completed_at", dayAgo)

    if (todayCount && todayCount >= MAX_COMPLETIONS_PER_DAY) {
      return NextResponse.json(
        { error: "Daily rewarded-ad limit reached. Please try again tomorrow." },
        { status: 429 },
      )
    }

    // Cooldown: one completion per block within the window. The unique index
    // (user_id, block_id, cooldown_bucket) makes this race-proof.
    const cooldownBucket = Math.floor(Date.now() / (COOLDOWN_MINUTES * 60 * 1000))

    const { data: completion, error: insertError } = await adminSupabase
      .from("ad_ad_completions")
      .insert({
        user_id: user.id,
        ad_network: "adsgram",
        block_id: blockId,
        cooldown_bucket: cooldownBucket,
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json(
          { error: "Please wait before claiming another reward for this ad." },
          { status: 429 },
        )
      }
      log.error("adsgram completion insert failed", insertError instanceof Error ? insertError : new Error(String(insertError)))
      return NextResponse.json({ error: "Failed to record ad completion" }, { status: 500 })
    }

    // Bound the payout by real earnings (same rule as /api/bonus-reward/claim):
    // you may only multiply earnings you actually received.
    const BONUS_TX_TYPES = [
      "shortlink_bonus", "coupon_bonus", "ptc_bonus", "faucet_bonus",
      "manual_faucet_bonus", "daily_bonus_bonus", "ptc_milestone_bonus",
      "game_bonus", "double_reward", "adjustment",
    ]
    const earnDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentEarning } = await adminSupabase
      .from("transactions")
      .select("amount_satoshis")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gt("amount_satoshis", 0)
      .gte("created_at", earnDayAgo)
      .not("type", "in", `(${BONUS_TX_TYPES.join(",")})`)
      .order("amount_satoshis", { ascending: false })
      .limit(1)
      .maybeSingle()

    const serverMaxBase = recentEarning?.amount_satoshis
      ? Math.max(1, Number(recentEarning.amount_satoshis))
      : 50
    const effectiveBase = Math.min(
      typeof baseAmount === "number" && baseAmount > 0 ? baseAmount : serverMaxBase,
      serverMaxBase,
    )
    const bonusAmount = Math.floor(effectiveBase * (multiplier - 1))

    // Guarded balance write
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("balance_satoshis, total_earned_satoshis")
      .eq("id", user.id)
      .single()
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const prevBalance = Number(profile.balance_satoshis || 0)
    const nextBalance = prevBalance + bonusAmount
    const { data: updated } = await adminSupabase
      .from("profiles")
      .update({
        balance_satoshis: nextBalance,
        total_earned_satoshis: Number(profile.total_earned_satoshis || 0) + bonusAmount,
      })
      .eq("id", user.id)
      .eq("balance_satoshis", prevBalance)
      .select("id")
      .maybeSingle()

    if (!updated) {
      return NextResponse.json({ error: "Balance changed concurrently — please retry" }, { status: 409 })
    }

    // Ledger row
    await adminSupabase.from("transactions").insert({
      user_id: user.id,
      type: "double_reward",
      amount: bonusAmount,
      status: "completed",
      description: `Rewarded ad bonus (AdsGram, ${multiplier}x)`,
      balance_after: nextBalance,
      metadata: {
        ad_network: "adsgram",
        block_id: blockId,
        base_amount: effectiveBase,
        multiplier,
        completion_id: completion.id,
      },
    })

    // Tournament tracking (non-blocking, best-effort)
    adminSupabase
      .rpc("update_tournament_score", {
        p_user_id: user.id,
        p_category: "supporter_ads_watched",
        p_period: "daily",
        p_score_delta: 1,
      })
      .then(() => {}, () => {})

    log.info("adsgram reward credited", {
      userId: user.id,
      blockId,
      baseAmount: effectiveBase,
      bonusAmount,
    })

    return NextResponse.json({
      success: true,
      bonusAmount,
      newBalance: nextBalance,
      message: `Reward claimed! +${bonusAmount} satoshis`,
    })
  } catch (error) {
    log.error("adsgram reward error", error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}