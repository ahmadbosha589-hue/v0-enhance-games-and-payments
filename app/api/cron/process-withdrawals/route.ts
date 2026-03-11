import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { getFaucetPayClient } from "@/lib/faucetpay/client"
import { log } from "@/lib/logger"

// This endpoint should be called by a cron job (e.g., Vercel Cron)
// Add to vercel.json: { "crons": [{ "path": "/api/cron/process-withdrawals", "schedule": "*/5 * * * *" }] }

export async function GET(request: Request) {
  const startTime = Date.now()

  try {
    // Verify cron secret
    const headersList = await headers()
    const authHeader = headersList.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
      return NextResponse.json({ error: "Failed to fetch withdrawals" }, { status: 500 })
    }

    if (!withdrawals || withdrawals.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No pending withdrawals",
        processed: 0,
      })
    }

    let faucetPay: ReturnType<typeof getFaucetPayClient> | null = null
    try {
      faucetPay = getFaucetPayClient()
    } catch (e) {
      log.warn("FaucetPay not configured, skipping payout processing")
      return NextResponse.json({
        success: false,
        message: "FaucetPay not configured",
        processed: 0,
      })
    }

    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [] as string[],
    }

    for (const withdrawal of withdrawals) {
      results.processed++

      try {
        // Mark as processing
        await supabase
          .from("withdrawals")
          .update({
            status: "processing",
            processed_at: new Date().toISOString(),
          })
          .eq("id", withdrawal.id)

        // Skip if flagged user
        if (withdrawal.profiles?.is_flagged && withdrawal.profiles?.fraud_score >= 70) {
          await supabase
            .from("withdrawals")
            .update({
              status: "failed",
              failure_reason: "Account flagged for review",
              completed_at: new Date().toISOString(),
            })
            .eq("id", withdrawal.id)

          results.failed++
          continue
        }

        // Get payment address
        const paymentAddress = withdrawal.payment_address || withdrawal.profiles?.faucetpay_email
        if (!paymentAddress) {
          await supabase
            .from("withdrawals")
            .update({
              status: "failed",
              failure_reason: "No payment address",
              completed_at: new Date().toISOString(),
            })
            .eq("id", withdrawal.id)

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
        await supabase
          .from("withdrawals")
          .update({
            status: "completed",
            external_tx_id: paymentResult.payout_id,
            completed_at: new Date().toISOString(),
          })
          .eq("id", withdrawal.id)

        // Update transaction
        await supabase
          .from("transactions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("withdrawal_id", withdrawal.id)

        // Create notification
        await supabase.from("notifications").insert({
          user_id: withdrawal.user_id,
          type: "withdrawal_completed",
          title: "Withdrawal Completed",
          message: `Your withdrawal of ${withdrawal.amount_satoshis} satoshis has been processed.`,
          data: { withdrawal_id: withdrawal.id, tx_id: paymentResult.payout_id },
        })

        // Audit log
        await supabase.from("audit_logs").insert({
          actor_id: withdrawal.user_id,
          actor_role: "system",
          action: "withdrawal_processed",
          resource_type: "withdrawal",
          resource_id: withdrawal.id,
          metadata: {
            amount: withdrawal.amount_satoshis,
            external_tx_id: paymentResult.payout_id,
          },
        })

        results.successful++
        log.info("Withdrawal processed", {
          withdrawalId: withdrawal.id,
          amount: withdrawal.net_amount_satoshis,
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        results.errors.push(`${withdrawal.id}: ${errorMessage}`)
        results.failed++

        // Mark as failed
        await supabase
          .from("withdrawals")
          .update({
            status: "failed",
            failure_reason: errorMessage,
            retry_count: (withdrawal.retry_count || 0) + 1,
          })
          .eq("id", withdrawal.id)

        // Refund balance if payment failed
        const { data: profile } = await supabase
          .from("profiles")
          .select("balance_satoshis")
          .eq("id", withdrawal.user_id)
          .single()

        if (profile) {
          await supabase
            .from("profiles")
            .update({
              balance_satoshis: Number(profile.balance_satoshis) + withdrawal.amount_satoshis,
            })
            .eq("id", withdrawal.user_id)

          // Notification for failed withdrawal
          await supabase.from("notifications").insert({
            user_id: withdrawal.user_id,
            type: "withdrawal_failed",
            title: "Withdrawal Failed",
            message: `Your withdrawal of ${withdrawal.amount_satoshis} satoshis failed. Balance has been refunded.`,
            data: { withdrawal_id: withdrawal.id, reason: errorMessage },
          })
        }

        log.error("Withdrawal processing failed", {
          withdrawalId: withdrawal.id,
          error: errorMessage,
        })
      }
    }

    const duration = Date.now() - startTime
    log.info("Withdrawal cron completed", { ...results, duration })

    return NextResponse.json({
      success: true,
      ...results,
      duration,
    })
  } catch (error) {
    log.error("Withdrawal cron error", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
