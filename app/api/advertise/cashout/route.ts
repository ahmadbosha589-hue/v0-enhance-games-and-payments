import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient, getUser } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { getFaucetPayApiKey, sendFaucetPayPayment } from "@/lib/payments/faucetpay"
import { headers } from "next/headers"
import { log } from "@/lib/logger"

export const dynamic = "force-dynamic"

const cashoutSchema = z.object({
  amount: z.number().min(1).max(10000),
  faucetpayEmail: z.string().email(),
})

/**
 * POST /api/advertise/cashout
 *
 * Withdraws unused advertising balance (USD) back to the user's FaucetPay
 * account. Flow:
 *   1. Verifies auth + ownership of the balance.
 *   2. Atomically deducts the FULL requested amount from ad_balance_usd
 *      first (conditional update — prevents double-spend).
 *   3. Sends USDT to the user's FaucetPay email at 1:1 USD rate.
 *   4. On payment failure, refunds the deducted amount and returns an error.
 *
 * The advertising pool lives in the platform's CCPayment merchant account
 * (where deposits land); this payout is sent from the platform's FaucetPay
 * wallet, so operators should keep that funded (or sweep funds across).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const parsed = cashoutSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 },
      )
    }

    const { amount, faucetpayEmail } = parsed.data

    // Verify against the SAVED verified email when present — a mismatched
    // email in the body is ignored in favor of the profile's linked address.
    const adminSupabase = requireAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("ad_balance_usd, faucetpay_email")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const destination = profile.faucetpay_email || faucetpayEmail
    if (!destination) {
      return NextResponse.json(
        { error: "Link your FaucetPay email in Settings before withdrawing" },
        { status: 400 },
      )
    }

    const available = Number(profile.ad_balance_usd || 0)
    if (amount > available) {
      return NextResponse.json(
        { error: `Insufficient advertising balance`, available },
        { status: 400 },
      )
    }

    // Atomic debit FIRST: only succeeds if ad_balance_usd is still >= amount.
    // Two concurrent cashouts cannot both pass this guard.
    const { data: debited, error: debitError } = await adminSupabase.rpc("debit_ad_balance", {
      p_user_id: user.id,
      p_amount: amount,
    })

    if (debitError || !debited?.success) {
      return NextResponse.json(
        { error: debited?.error || "Insufficient advertising balance", available },
        { status: 400 },
      )
    }

    // Send USDT at 1:1 USD via FaucetPay (8-decimal smallest unit).
    const apiKey = await getFaucetPayApiKey()
    if (!apiKey) {
      // Refund before failing out.
      await adminSupabase.rpc("credit_ad_balance", { p_user_id: user.id, p_amount: amount })
      return NextResponse.json(
        { error: "Withdrawals are temporarily unavailable — try again later" },
        { status: 503 },
      )
    }

    const headersList = await headers()
    const ip =
      headersList.get("x-forwarded-for")?.split(",")[0] ||
      headersList.get("x-real-ip") ||
      "127.0.0.1"

    const amountSmallestUnit = Math.floor(amount * 100_000_000) // USDT: 8 decimals
    const payment = await sendFaucetPayPayment(
      apiKey,
      destination,
      amountSmallestUnit,
      "USDT",
      ip,
    )

    if (!payment.success) {
      // Refund the full debit on failure — never leave money in limbo.
      await adminSupabase.rpc("credit_ad_balance", { p_user_id: user.id, p_amount: amount })
      log.warn("[ad-cashout] payment failed; refunded", { userId: user.id, amount, error: payment.error })
      return NextResponse.json({ error: payment.error }, { status: 502 })
    }

    log.info("[ad-cashout] paid", { userId: user.id, amount, payoutId: payment.payoutId })

    return NextResponse.json({
      success: true,
      amount,
      currency: "USDT",
      payoutId: payment.payoutId,
      message: `${amount.toFixed(2)} USDT has been sent to your FaucetPay account.`,
    })
  } catch (error) {
    log.error("[ad-cashout] unexpected error", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
