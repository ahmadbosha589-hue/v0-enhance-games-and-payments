
import { NextResponse } from "next/server"
import { getCCPaymentClient } from "@/lib/ccpayment/client"
import { log } from "@/lib/logger"
import { headers } from "next/headers"
import { requireAdminClient } from "@/lib/supabase/admin-client"

const SATOSHI_PER_USD = 2500000 // Approximate conversion rate

export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const signature = headersList.get("sign") || ""
    const timestamp = headersList.get("timestamp") || ""
    const body = await request.text()

    // Verify webhook signature
    const ccpayment = getCCPaymentClient()
    if (!ccpayment.verifyWebhook(signature, timestamp, body)) {
      log.warn("CCPayment webhook signature verification failed")
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const data = JSON.parse(body)
    const adminSupabase = requireAdminClient()

    log.info("CCPayment webhook received", { type: data.type, orderId: data.order_id })

    // Handle different webhook types
    switch (data.type) {
      case "Payment.Success": {
        // Deposit completed
        const { data: deposit } = await adminSupabase
          .from("ccpayment_deposits")
          .select("*")
          .eq("ccpayment_order_id", data.order_id)
          .single()

        if (deposit && deposit.status === "pending") {
          // Update deposit status
          await adminSupabase
            .from("ccpayment_deposits")
            .update({
              status: "completed",
              tx_hash: data.tx_hash,
              completed_at: new Date().toISOString()
            })
            .eq("ccpayment_order_id", data.order_id)

          // Convert USD to satoshis and credit user
          const satoshisToCredit = Math.floor(deposit.amount_usd * SATOSHI_PER_USD)

          const { data: profile } = await adminSupabase
            .from("profiles")
            .select("balance_satoshis, ad_balance_usd")
            .eq("id", deposit.user_id)
            .single()

          if (profile) {
            if (deposit.purpose === "advertising") {
              // Credit advertising balance
              await adminSupabase
                .from("profiles")
                .update({
                  ad_balance_usd: Number(profile.ad_balance_usd || 0) + deposit.amount_usd
                })
                .eq("id", deposit.user_id)
            } else {
              // Credit main balance
              const newBalance = Number(profile.balance_satoshis) + satoshisToCredit
              await adminSupabase
                .from("profiles")
                .update({ balance_satoshis: newBalance })
                .eq("id", deposit.user_id)
            }

            // Create transaction record
            await adminSupabase.from("transactions").insert({
              user_id: deposit.user_id,
              type: "deposit",
              status: "completed",
              amount_satoshis: satoshisToCredit,
              balance_before: profile.balance_satoshis,
              balance_after: Number(profile.balance_satoshis) + satoshisToCredit,
              description: `CCPayment deposit - ${deposit.amount_usd} USD`,
              metadata: {
                ccpayment_order_id: data.order_id,
                tx_hash: data.tx_hash,
                purpose: deposit.purpose
              }
            })

            // Create notification
            await adminSupabase.from("notifications").insert({
              user_id: deposit.user_id,
              type: "deposit_completed",
              title: "Deposit Successful",
              message: deposit.purpose === "advertising"
                ? `Your deposit of $${deposit.amount_usd} has been credited to your advertising balance.`
                : `Your deposit of ${satoshisToCredit.toLocaleString()} satoshis has been credited to your account.`,
              data: { deposit_id: data.order_id }
            })

            log.info("CCPayment deposit credited", {
              userId: deposit.user_id,
              amount: satoshisToCredit,
              purpose: deposit.purpose
            })
          }
        }
        break
      }

      case "Payment.Failed": {
        // Deposit failed
        await adminSupabase
          .from("ccpayment_deposits")
          .update({
            status: "failed",
            error_message: data.error_message
          })
          .eq("ccpayment_order_id", data.order_id)

        const { data: deposit } = await adminSupabase
          .from("ccpayment_deposits")
          .select("user_id")
          .eq("ccpayment_order_id", data.order_id)
          .single()

        if (deposit) {
          await adminSupabase.from("notifications").insert({
            user_id: deposit.user_id,
            type: "deposit_failed",
            title: "Deposit Failed",
            message: "Your deposit could not be processed. Please try again.",
            data: { deposit_id: data.order_id }
          })
        }
        break
      }

      case "Withdraw.Success": {
        // Withdrawal completed
        await adminSupabase
          .from("ccpayment_withdrawals")
          .update({
            status: "completed",
            tx_hash: data.tx_hash,
            completed_at: new Date().toISOString()
          })
          .eq("ccpayment_order_id", data.order_id)

        const { data: withdrawal } = await adminSupabase
          .from("ccpayment_withdrawals")
          .select("user_id, amount_satoshis, coin_id")
          .eq("ccpayment_order_id", data.order_id)
          .single()

        if (withdrawal) {
          await adminSupabase.from("notifications").insert({
            user_id: withdrawal.user_id,
            type: "withdrawal_completed",
            title: "Withdrawal Completed",
            message: `Your withdrawal of ${Number(withdrawal.amount_satoshis).toLocaleString()} satoshis to ${withdrawal.coin_id} has been sent.`,
            data: { withdrawal_id: data.order_id, tx_hash: data.tx_hash }
          })
        }
        break
      }

      case "Withdraw.Failed": {
        // Withdrawal failed - refund balance
        const { data: withdrawal } = await adminSupabase
          .from("ccpayment_withdrawals")
          .select("*")
          .eq("ccpayment_order_id", data.order_id)
          .single()

        if (withdrawal && withdrawal.status === "pending") {
          // Refund the balance
          const { data: profile } = await adminSupabase
            .from("profiles")
            .select("balance_satoshis")
            .eq("id", withdrawal.user_id)
            .single()

          if (profile) {
            const newBalance = Number(profile.balance_satoshis) + Number(withdrawal.amount_satoshis)
            await adminSupabase
              .from("profiles")
              .update({ balance_satoshis: newBalance })
              .eq("id", withdrawal.user_id)
          }

          await adminSupabase
            .from("ccpayment_withdrawals")
            .update({
              status: "failed",
              error_message: data.error_message
            })
            .eq("ccpayment_order_id", data.order_id)

          await adminSupabase.from("notifications").insert({
            user_id: withdrawal.user_id,
            type: "withdrawal_failed",
            title: "Withdrawal Failed",
            message: "Your withdrawal could not be processed. Your balance has been refunded.",
            data: { withdrawal_id: data.order_id }
          })

          log.info("CCPayment withdrawal failed and refunded", {
            userId: withdrawal.user_id,
            amount: withdrawal.amount_satoshis
          })
        }
        break
      }

      case "Swap.Success": {
        const { data: swapRecord } = await adminSupabase
          .from("ccpayment_swaps")
          .select("*")
          .eq("ccpayment_order_id", data.order_id)
          .single()

        await adminSupabase
          .from("ccpayment_swaps")
          .update({
            status: "completed",
            tx_hash: data.tx_hash,
            to_amount: data.to_amount || swapRecord?.to_amount,
            completed_at: new Date().toISOString()
          })
          .eq("ccpayment_order_id", data.order_id)

        if (swapRecord) {
          await adminSupabase.from("notifications").insert({
            user_id: swapRecord.user_id,
            type: "swap_completed",
            title: "Swap Completed",
            message: `Your swap of ${swapRecord.from_amount} ${swapRecord.from_coin_id} to ${data.to_amount || swapRecord.to_amount} ${swapRecord.to_coin_id} has been completed.`,
            data: {
              swap_id: data.order_id,
              tx_hash: data.tx_hash,
              from_coin: swapRecord.from_coin_id,
              to_coin: swapRecord.to_coin_id
            }
          })

          log.info("CCPayment swap completed", {
            userId: swapRecord.user_id,
            fromCoin: swapRecord.from_coin_id,
            toCoin: swapRecord.to_coin_id,
            amount: swapRecord.from_amount
          })
        }
        break
      }

      case "Swap.Failed": {
        const { data: failedSwap } = await adminSupabase
          .from("ccpayment_swaps")
          .select("*")
          .eq("ccpayment_order_id", data.order_id)
          .single()

        await adminSupabase
          .from("ccpayment_swaps")
          .update({
            status: "failed",
            error_message: data.error_message
          })
          .eq("ccpayment_order_id", data.order_id)

        if (failedSwap) {
          await adminSupabase.from("notifications").insert({
            user_id: failedSwap.user_id,
            type: "swap_failed",
            title: "Swap Failed",
            message: `Your swap from ${failedSwap.from_coin_id} to ${failedSwap.to_coin_id} could not be completed. Please try again.`,
            data: { swap_id: data.order_id, error: data.error_message }
          })

          log.warn("CCPayment swap failed", {
            userId: failedSwap.user_id,
            orderId: data.order_id,
            error: data.error_message
          })
        }
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    log.error("CCPayment webhook error", { error })
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
