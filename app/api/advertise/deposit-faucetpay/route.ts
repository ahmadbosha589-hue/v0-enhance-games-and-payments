import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { usdToSatoshis } from "@/lib/pricing/crypto-rates"
import { log } from "@/lib/logger"

export const dynamic = "force-dynamic"

const depositSchema = z.object({
  amount: z.number().min(5).max(10000),
})

/**
 * POST /api/advertise/deposit-faucetpay
 *
 * Funds the user's ADVERTISING balance (ad_balance_usd) from their on-platform
 * satoshi earning balance, at the LIVE BTC/USD rate.
 *
 * Atomicity: single RPC `transfer_earnings_to_ad_balance` locks the profile
 * row, verifies sufficient satoshis, deducts, and credits ad_balance_usd in
 * one statement — no read-then-write race, no partial state.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const parsed = depositSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Amount must be between $5 and $10,000", details: parsed.error.issues },
        { status: 400 },
      )
    }

    const amount = parsed.data.amount

    // Live rate first: refuse cleanly if pricing is unavailable rather than
    // charging a stale amount.
    let rate: number
    let satoshisToCharge: number
    try {
      const converted = await usdToSatoshis(amount)
      rate = converted.btcUsd
      satoshisToCharge = converted.satoshis
    } catch {
      return NextResponse.json(
        { error: "Live BTC rate unavailable — please try again shortly", code: "RATE_UNAVAILABLE" },
        { status: 503 },
      )
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    const { data: result, error: rpcError } = await adminSupabase.rpc(
      "transfer_earnings_to_ad_balance",
      {
        p_user_id: user.id,
        p_amount_usd: amount,
        p_price_satoshis: satoshisToCharge,
        p_btc_rate: rate,
      },
    )

    if (rpcError || !result?.success) {
      const insufficient = /insufficient/i.test(rpcError?.message || result?.error || "")
      log.warn("[fp-ad-deposit] transfer failed", {
        userId: user.id,
        amount,
        error: rpcError?.message || result?.error,
      })
      return NextResponse.json(
        {
          error: insufficient ? "Insufficient satoshi balance" : result?.error || "Transfer failed",
          required: insufficient ? satoshisToCharge : undefined,
        },
        { status: insufficient ? 400 : 500 },
      )
    }

    log.info("[fp-ad-deposit] credited", {
      userId: user.id,
      usd: amount,
      sats: satoshisToCharge,
      btcUsd: rate,
    })

    return NextResponse.json({
      success: true,
      amountUsd: amount,
      satoshisCharged: satoshisToCharge,
      btcUsd: rate,
      newAdBalance: result.new_ad_balance,
      message: `${amount.toFixed(2)} USD advertising credit added.`,
    })
  } catch (error) {
    log.error("[fp-ad-deposit] unexpected error", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
