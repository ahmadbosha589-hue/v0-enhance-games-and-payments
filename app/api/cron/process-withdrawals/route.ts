import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { getFaucetPayClient, FaucetPayError, isFaucetPayConfigured } from "@/lib/faucetpay/client"
import { log } from "@/lib/logger"
import { requireAdminClient } from "@/lib/supabase/admin-client"

// Called directly by /api/cron/run (unified cron handler)

export async function runProcessWithdrawals() {
  const startTime = Date.now()
  const supabase = await createClient()

  // Get pending withdrawals (oldest first, limit to prevent timeout)
  const { data: withdrawals, error: fetchError } = await supabase
    .from("withdrawals")
    .select(`
      *,
      profiles:user_id (
        email,
        faucetpay_email,
        fraud_score,
        is_flagged
      )
    `)
    .eq("status", "pending")
    .eq("is_flagged", false)
    .order("created_at", { ascending: true })
    .limit(10)

  if (fetchError) {
    log.error("Failed to fetch withdrawals", { error: fetchError })
    throw new Error("Failed to fetch withdrawals")
  }

  if (!withdrawals || withdrawals.length === 0) {
    return { processed: 0, message: "No pending withdrawals" }
  }

  // Check FaucetPay configuration first
  if (!isFaucetPayConfigured()) {
    log.warn("FaucetPay not configured, skipping payout processing")
    return { processed: 0, message: "FaucetPay not configured - please set FAUCETPAY_API_KEY" }
  }

  const adminSupabase = requireAdminClient()

  const results = {
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[],
  }

  for (const withdrawal of withdrawals) {
    results.processed++

    try {
      // Mark as processing
      await adminSupabase
        .from("withdrawals")
        .update({
          status: "processing",
          processed_at: new Date().toISOString(),
        })
        .eq("id", withdrawal.id)

      // Skip if flagged user
      if (withdrawal.profiles?.is_flagged && withdrawal.profiles?.fraud_score >= 70) {
        await adminSupabase
          .from("withdrawals")
          .update({
            status: "review",
            failure_reason: "Account flagged for review - requires manual approval",
          })
          .eq("id", withdrawal.id)

        results.skipped++
        continue
      }

      // Get payment address (FaucetPay email)
      const paymentAddress = withdrawal.payment_address || withdrawal.profiles?.faucetpay_email
      if (!paymentAddress) {
        await adminSupabase
          .from("withdrawals")
          .update({
            status: "failed",
            failure_reason: "No FaucetPay email linked. Please add your FaucetPay email in settings.",
            completed_at: new Date().toISOString(),
          })
          .eq("id", withdrawal.id)

        await refundWithdrawal(adminSupabase, withdrawal, "No FaucetPay email linked")
        results.failed++
        continue
      }

      // Get the currency from withdrawal or default to BTC
      const currency = withdrawal.payment_currency || "BTC"

      // Get FaucetPay client for this currency
      let faucetPay
      try {
        faucetPay = getFaucetPayClient(currency)
      } catch (error) {
        const errorMessage = error instanceof FaucetPayError ? error.message : "FaucetPay configuration error"
        await adminSupabase
          .from("withdrawals")
          .update({
            status: "failed",
            failure_reason: errorMessage,
            completed_at: new Date().toISOString(),
          })
          .eq("id", withdrawal.id)

        await refundWithdrawal(adminSupabase, withdrawal, errorMessage)
        results.failed++
        continue
      }

      // Process payment via FaucetPay
      const paymentResult = await faucetPay.sendPayment(
        paymentAddress,
        withdrawal.net_amount_satoshis,
        "0.0.0.0", // Cron doesn't have user IP
        false,
      )

      // Update withdrawal as completed
      await adminSupabase
        .from("withdrawals")
        .update({
          status: "completed",
          external_tx_id: paymentResult.payout_id,
          completed_at: new Date().toISOString(),
        })
        .eq("id", withdrawal.id)

      // Update transaction
      await adminSupabase
        .from("transactions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("withdrawal_id", withdrawal.id)

      // Create notification
      await adminSupabase.from("notifications").insert({
        user_id: withdrawal.user_id,
        type: "withdrawal_completed",
        title: "Withdrawal Completed",
        message: `Your withdrawal of ${withdrawal.amount_satoshis} satoshis has been sent to your FaucetPay account.`,
        data: { withdrawal_id: withdrawal.id, tx_id: paymentResult.payout_id },
      })

      // Audit log
      await adminSupabase.from("audit_logs").insert({
        actor_id: withdrawal.user_id,
        actor_role: "system",
        action: "withdrawal_processed",
        resource_type: "withdrawal",
        resource_id: withdrawal.id,
        metadata: {
          amount: withdrawal.amount_satoshis,
          net_amount: withdrawal.net_amount_satoshis,
          external_tx_id: paymentResult.payout_id,
          faucetpay_balance: paymentResult.balance,
        },
      })

      results.successful++
      log.info("Withdrawal processed", {
        withdrawalId: withdrawal.id,
        amount: withdrawal.net_amount_satoshis,
        payoutId: paymentResult.payout_id,
      })
    } catch (error) {
      let errorMessage = "Unknown error"
      let shouldRefund = true

      if (error instanceof FaucetPayError) {
        errorMessage = error.message
        shouldRefund = !error.isUserError
      } else if (error instanceof Error) {
        errorMessage = error.message
      }

      results.errors.push(`${withdrawal.id}: ${errorMessage}`)
      results.failed++

      await adminSupabase
        .from("withdrawals")
        .update({
          status: "failed",
          failure_reason: errorMessage,
          retry_count: (withdrawal.retry_count || 0) + 1,
          completed_at: new Date().toISOString(),
        })
        .eq("id", withdrawal.id)

      if (shouldRefund) {
        await refundWithdrawal(adminSupabase, withdrawal, errorMessage)
      } else {
        await refundWithdrawal(adminSupabase, withdrawal, errorMessage, true)
      }

      log.error("Withdrawal processing failed", {
        withdrawalId: withdrawal.id,
        error: errorMessage,
        shouldRefund,
      })
    }
  }

  const duration = Date.now() - startTime
  log.info("Withdrawal cron completed", { ...results, duration })

  return { ...results, duration }
}

async function refundWithdrawal(
  // NonNullable: the caller obtains this via requireAdminClient(), which throws
  // rather than returning null, so this helper must not re-widen the type back
  // to nullable (that is what allowed the unchecked `.from()` calls).
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  withdrawal: any,
  reason: string,
  isUserError = false
) {
  const { data: profile } = await db
    .from("profiles")
    .select("balance_satoshis")
    .eq("id", withdrawal.user_id)
    .single()

  if (profile) {
    await db
      .from("profiles")
      .update({
        balance_satoshis: Number(profile.balance_satoshis) + withdrawal.amount_satoshis,
      })
      .eq("id", withdrawal.user_id)

    const message = isUserError
      ? `Your withdrawal of ${withdrawal.amount_satoshis} satoshis failed: ${reason}. Your balance has been refunded. Please fix the issue and try again.`
      : `Your withdrawal of ${withdrawal.amount_satoshis} satoshis failed. Balance has been refunded. Please try again later.`

    await db.from("notifications").insert({
      user_id: withdrawal.user_id,
      type: "withdrawal_failed",
      title: "Withdrawal Failed",
      message,
      data: { withdrawal_id: withdrawal.id, reason },
    })
  }
}

// Keep the individual route for manual triggers / testing
export async function GET(request: Request) {
  try {
    const headersList = await headers()
    const authHeader = headersList.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const results = await runProcessWithdrawals()
    return NextResponse.json({ success: true, ...results })
  } catch (error) {
    log.error("Withdrawal cron error", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}