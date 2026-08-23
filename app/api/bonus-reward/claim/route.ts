import { NextRequest, NextResponse } from "next/server"
import { getUser, createAdminClient } from "@/lib/supabase/server"
import { isRewardedAdsEnabled } from "@/lib/rewards/rewarded-ads"
import { verifyWatchToken } from "@/lib/rewards/watch-session"
import { headers } from "next/headers"
import { log } from "@/lib/logger"

const VALID_TYPES = [
  "shortlink_double",
  "coupon_double",
  "ptc_double",
  "ptc_5x",
  "faucet_double",
  "manual_faucet_double",
] as const

type BonusType = (typeof VALID_TYPES)[number]

const TYPE_TRANSACTION_MAP: Record<BonusType, string> = {
  shortlink_double: "bonus",
  coupon_double: "bonus",
  ptc_double: "bonus",
  ptc_5x: "bonus",
  faucet_double: "streak_bonus",
  manual_faucet_double: "bonus",
}

// Server-authoritative bonus table: the client's baseAmount/multiplier are
// NEVER trusted. Each type pays a fixed bonus derived from the base reward of
// that surface, clamped to sane maximums.
const BONUS_RULES: Record<BonusType, { maxBonus: number; defaultBase: number }> = {
  shortlink_double: { maxBonus: 10, defaultBase: 2 },
  coupon_double: { maxBonus: 100, defaultBase: 50 },
  ptc_double: { maxBonus: 10, defaultBase: 5 },
  ptc_5x: { maxBonus: 40, defaultBase: 5 },
  faucet_double: { maxBonus: 9, defaultBase: 4 },
  manual_faucet_double: { maxBonus: 9, defaultBase: 4 },
}

export async function POST(request: NextRequest) {
  // Config-gated: enabled only when a real rewarded-ad provider is wired up.
  if (!isRewardedAdsEnabled()) {
    return NextResponse.json(
      { error: "Verified rewarded-ad inventory is not enabled for this deployment" },
      { status: 503 },
    )
  }

  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { type, watchToken } = body as { type?: string; watchToken?: string }

    if (!type || !VALID_TYPES.includes(type as BonusType)) {
      return NextResponse.json({ error: "Invalid bonus type" }, { status: 400 })
    }
    if (!watchToken || typeof watchToken !== "string") {
      return NextResponse.json(
        { error: "Missing rewarded-ad proof — complete a verified ad session first" },
        { status: 400 },
      )
    }

    // Verify the single-use HMAC token minted by the provider S2S callback.
    // It binds userId + txid; kind must be "rewarded-ad". Expiry is enforced
    // inside verifyWatchToken.
    let txid: string
    try {
      const payload = verifyWatchToken(watchToken, {
        kind: "rewarded-ad",
        userId: user.id,
        resourceId: "*", // verified below against the event row
      })
      txid = payload.txid || payload.resourceId
      if (!txid) throw new Error("token missing txid")
    } catch (e) {
      log.warn("[bonus-reward] watch token rejected", {
        userId: user.id,
        error: e instanceof Error ? e.message : String(e),
      })
      return NextResponse.json(
        { error: "Rewarded-ad session is invalid or expired — rewatch the ads" },
        { status: 400 },
      )
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    // Claim the provider event atomically: set claimed_at ONLY if not already
    // claimed. A second claim attempt on the same ad view matches zero rows.
    const now = new Date().toISOString()
    const { data: claimedEvent, error: claimError } = await adminSupabase
      .from("rewarded_ad_events")
      .update({ claimed_at: now })
      .eq("txid", txid)
      .eq("user_id", user.id)
      .is("claimed_at", null)
      .select("id")

    if (claimError) {
      log.error("[bonus-reward] event claim failed", { txid, error: claimError })
      return NextResponse.json({ error: "Failed to verify ad completion" }, { status: 500 })
    }
    if (!claimedEvent || claimedEvent.length === 0) {
      return NextResponse.json(
        { error: "This ad reward was already claimed or does not exist" },
        { status: 409 },
      )
    }

    // Server-computed bonus amount.
    const rules = BONUS_RULES[type as BonusType]
    let bonusAmount = Math.min(rules.defaultBase, rules.maxBonus)
    try {
      // Prefer the amount the provider reported (if any), clamped to the cap.
      const { data: ev } = await adminSupabase
        .from("rewarded_ad_events")
        .select("amount")
        .eq("txid", txid)
        .single()
      const reported = Number((ev as { amount?: number | null } | null)?.amount ?? NaN)
      if (Number.isFinite(reported) && reported > 0) {
        bonusAmount = Math.min(reported, rules.maxBonus)
      } else {
        bonusAmount = Math.min(rules.defaultBase, rules.maxBonus)
      }
    } catch {
      bonusAmount = Math.min(rules.defaultBase, rules.maxBonus)
    }

    // Atomic credit + ledger row via the audited balance RPC.
    const idempotencyKey = `rewarded_ad:${txid}`
    const { data: rpcResult, error: rpcError } = await adminSupabase.rpc("safe_add_balance", {
      p_user_id: user.id,
      p_amount: bonusAmount,
      p_type: TYPE_TRANSACTION_MAP[type as BonusType],
      p_description: `Rewarded ads bonus (${type})`,
      p_metadata: { bonus_type: type, provider_txid: txid, idempotency_key: idempotencyKey },
      p_idempotency_key: idempotencyKey,
    })

    if (rpcError) {
      log.error("[bonus-reward] atomic credit failed", { txid, error: rpcError })
      return NextResponse.json({ error: "Failed to credit bonus" }, { status: 500 })
    }

    const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
    if (!row?.success) {
      const message = row?.error_message === "Duplicate transaction"
        ? "This ad reward was already claimed"
        : row?.error_message || "Failed to credit bonus"
      return NextResponse.json({ error: message }, { status: 409 })
    }

    log.info("[bonus-reward] credited", {
      userId: user.id,
      type,
      bonusAmount,
      txid,
    })

    return NextResponse.json({
      success: true,
      bonusAmount,
      totalAmount: bonusAmount,
      newBalance: row.new_balance,
    })
  } catch (error) {
    log.error("Bonus reward error", { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
