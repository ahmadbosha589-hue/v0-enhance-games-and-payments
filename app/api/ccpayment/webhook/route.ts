import { headers } from "next/headers"
import { getCCPaymentClient, isCCPaymentTimestampFresh, usdToSatoshis } from "@/lib/ccpayment/client"
import { reconcileInvoicePayment } from "@/lib/ccpayment/reconciliation"
import { log } from "@/lib/logger"
import { requireAdminClient } from "@/lib/supabase/admin-client"

const ACK_HEADERS = { "Content-Type": "text/plain; charset=utf-8" }

function acknowledge() {
  // CCPayment retries unless the body contains the exact Success string.
  return new Response("Success", { status: 200, headers: ACK_HEADERS })
}

function reject(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

async function findDeposit(adminSupabase: ReturnType<typeof requireAdminClient>, orderId: string) {
  const byMerchantOrder = await adminSupabase
    .from("ccpayment_deposits")
    .select("*")
    .eq("merchant_order_id", orderId)
    .maybeSingle()

  if (byMerchantOrder.data || byMerchantOrder.error) return byMerchantOrder

  return adminSupabase
    .from("ccpayment_deposits")
    .select("*")
    .eq("ccpayment_order_id", orderId)
    .maybeSingle()
}

async function findWithdrawal(adminSupabase: ReturnType<typeof requireAdminClient>, orderId: string, recordId: string) {
  const byRecord = await adminSupabase
    .from("ccpayment_withdrawals")
    .select("*")
    .eq("ccpayment_order_id", recordId)
    .maybeSingle()

  if (byRecord.data || byRecord.error) return byRecord

  return adminSupabase
    .from("ccpayment_withdrawals")
    .select("*")
    .eq("merchant_order_id", orderId)
    .maybeSingle()
}

export async function POST(request: Request) {
  try {
    const headersList = await headers()
    const signature = headersList.get("sign") || ""
    const timestamp = headersList.get("timestamp") || ""
    const body = await request.text()

    if (!isCCPaymentTimestampFresh(timestamp)) {
      log.warn("CCPayment webhook timestamp rejected")
      return reject("Invalid or expired timestamp", 401)
    }

    if (!process.env.CCPAYMENT_APP_ID || !process.env.CCPAYMENT_APP_SECRET) {
      return reject("CCPayment webhook is not configured", 503)
    }

    const ccpayment = getCCPaymentClient()
    if (!ccpayment.verifyWebhook(signature, timestamp, body)) {
      log.warn("CCPayment webhook signature verification failed")
      return reject("Invalid signature", 401)
    }

    let data: { type?: string; msg?: Record<string, unknown> }
    try {
      data = JSON.parse(body) as { type?: string; msg?: Record<string, unknown> }
    } catch {
      return reject("Invalid JSON payload", 400)
    }

    const adminSupabase = requireAdminClient()
    const msg = data.msg || {}

    if (data.type === "ApiDeposit") {
      const orderId = String(msg.orderId || "")
      const recordId = String(msg.recordId || "")
      const status = String(msg.status || "")

      if (!orderId || !recordId) return reject("Missing CCPayment order or record ID", 400)

      const { data: boosterPurchase, error: boosterLookupError } = await adminSupabase
        .from("booster_purchases")
        .select("id, user_id, payment_status, payment_reference, amount_usd")
        .eq("payment_reference", orderId)
        .maybeSingle()

      if (boosterLookupError) throw boosterLookupError

      const depositResult = await findDeposit(adminSupabase, orderId)
      if (depositResult.error) throw depositResult.error
      const deposit = depositResult.data
      const orderInfo = deposit?.coin_id && deposit?.chain
        ? await ccpayment.getAppOrderInfo(orderId)
        : await ccpayment.getInvoiceOrderInfo(orderId)

      const expectedValue = Number(boosterPurchase?.amount_usd ?? deposit?.amount_usd ?? 0)
      const reconciliation = reconcileInvoicePayment(orderInfo, expectedValue, recordId)

      if (status === "Failed") {
        if (boosterPurchase) {
          await adminSupabase
            .from("booster_purchases")
            .update({ payment_status: "failed" })
            .eq("id", boosterPurchase.id)
            .eq("payment_status", "pending")
        }
        if (deposit) {
          await adminSupabase
            .from("ccpayment_deposits")
            .update({ status: "failed", error_message: "CCPayment reported a failed deposit" })
            .eq("id", deposit.id)
            .eq("status", "pending")
        }
        return acknowledge()
      }

      // Processing notifications are acknowledged but never fulfilled.
      if (status !== "Success" || !reconciliation.eligible) {
        log.warn("CCPayment deposit not eligible for automatic fulfillment", {
          orderId,
          recordId,
          status,
          reason: reconciliation.reason,
          paidValue: reconciliation.paidValue,
        })
        return acknowledge()
      }

      if (boosterPurchase) {
        const { data: activation, error: activationError } = await adminSupabase.rpc(
          "activate_booster_purchase",
          {
            p_payment_reference: orderId,
            p_transaction_hash: reconciliation.transactionHash || recordId,
          },
        )

        if (activationError || !activation?.success) {
          log.error("Booster payment activation failed", {
            orderId,
            recordId,
            error: activationError?.message || "activation returned no success",
          })
          return reject("Booster activation failed", 500)
        }

        if (!activation.already_active) {
          await adminSupabase.from("notifications").insert({
            user_id: boosterPurchase.user_id,
            type: "booster_activated",
            title: "Booster Activated",
            message: "Your CCPayment was confirmed and your booster is now active.",
            data: { purchase_id: boosterPurchase.id, record_id: recordId, tx_hash: reconciliation.transactionHash || null },
          })
        }

        return acknowledge()
      }

      if (!deposit || deposit.status !== "pending") return acknowledge()

      let satoshisToCredit = 0
      if (deposit.purpose !== "advertising") {
        satoshisToCredit = await usdToSatoshis(Number(deposit.amount_usd))
      }

      const { data: profile, error: profileError } = await adminSupabase
        .from("profiles")
        .select("balance_satoshis, ad_balance_usd")
        .eq("id", deposit.user_id)
        .single()
      if (profileError || !profile) throw profileError || new Error("Deposit profile not found")

      if (deposit.purpose === "advertising") {
        const { error } = await adminSupabase
          .from("profiles")
          .update({ ad_balance_usd: Number(profile.ad_balance_usd || 0) + Number(deposit.amount_usd) })
          .eq("id", deposit.user_id)
        if (error) throw error
      } else {
        const { error } = await adminSupabase
          .from("profiles")
          .update({ balance_satoshis: Number(profile.balance_satoshis) + satoshisToCredit })
          .eq("id", deposit.user_id)
        if (error) throw error
      }

      const { error: transactionError } = await adminSupabase.from("transactions").insert({
        user_id: deposit.user_id,
        type: "deposit",
        status: "completed",
        amount_satoshis: satoshisToCredit,
        balance_before: profile.balance_satoshis,
        balance_after: Number(profile.balance_satoshis) + satoshisToCredit,
        description: `CCPayment deposit - ${deposit.amount_usd} USD`,
        metadata: {
          ccpayment_order_id: orderId,
          ccpayment_record_id: recordId,
          tx_hash: reconciliation.transactionHash,
          purpose: deposit.purpose,
        },
        idempotency_key: `ccpayment:${recordId}`,
      })
      if (transactionError && !/duplicate|unique/i.test(transactionError.message)) throw transactionError

      const { error: depositUpdateError } = await adminSupabase
        .from("ccpayment_deposits")
        .update({
          status: "completed",
          tx_hash: reconciliation.transactionHash || recordId,
          completed_at: new Date().toISOString(),
        })
        .eq("id", deposit.id)
        .eq("status", "pending")
      if (depositUpdateError) throw depositUpdateError

      await adminSupabase.from("notifications").insert({
        user_id: deposit.user_id,
        type: "deposit_completed",
        title: "Deposit Successful",
        message: deposit.purpose === "advertising"
          ? `Your deposit of $${deposit.amount_usd} has been credited to your advertising balance.`
          : `Your deposit of ${satoshisToCredit.toLocaleString()} satoshis has been credited to your account.`,
        data: { deposit_id: orderId, record_id: recordId },
      })

      return acknowledge()
    }

    if (data.type === "ApiWithdrawal") {
      const orderId = String(msg.orderId || "")
      const recordId = String(msg.recordId || "")
      const status = String(msg.status || "")
      if (!orderId || !recordId) return reject("Missing CCPayment withdrawal IDs", 400)

      const withdrawalResult = await findWithdrawal(adminSupabase, orderId, recordId)
      if (withdrawalResult.error) throw withdrawalResult.error
      const withdrawal = withdrawalResult.data
      if (!withdrawal) return acknowledge()

      if (status === "Success") {
        await adminSupabase
          .from("ccpayment_withdrawals")
          .update({ status: "completed", tx_hash: recordId, completed_at: new Date().toISOString() })
          .eq("id", withdrawal.id)
          .eq("status", "pending")
      } else if (status === "Failed" || status === "Rejected") {
        const { data: profile, error: profileError } = await adminSupabase
          .from("profiles")
          .select("balance_satoshis")
          .eq("id", withdrawal.user_id)
          .single()
        if (profileError || !profile) throw profileError || new Error("Withdrawal profile not found")

        await adminSupabase
          .from("profiles")
          .update({ balance_satoshis: Number(profile.balance_satoshis) + Number(withdrawal.amount_satoshis) })
          .eq("id", withdrawal.user_id)
        await adminSupabase
          .from("ccpayment_withdrawals")
          .update({ status: "failed", error_message: `CCPayment withdrawal ${status.toLowerCase()}` })
          .eq("id", withdrawal.id)
          .eq("status", "pending")
      }

      return acknowledge()
    }

    // Acknowledge other provider notifications without treating them as a
    // booster/deposit payment. CCPayment requires the exact Success body.
    log.info("CCPayment webhook acknowledged without local fulfillment", { type: data.type })
    return acknowledge()
  } catch (error) {
    log.error("CCPayment webhook error", { error })
    return reject("Webhook processing failed", 500)
  }
}
