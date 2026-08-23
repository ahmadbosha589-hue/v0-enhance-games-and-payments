import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { log } from "@/lib/logger"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"

/**
 * FaucetPay Merchant IPN callback.
 *
 * FaucetPay POSTs form-encoded fields:
 *   token, transaction_id, merchant_username, payer_username,
 *   amount1/currency1 (USD price), amount2/currency2 (crypto paid),
 *   custom (= our signed session token), exchange_rate, status
 *
 * Verification is server-to-server: GET
 * https://faucetpay.io/merchant/get-payment/{token} — FaucetPay answers with
 * the payment facts. We NEVER trust the POST body alone.
 */

const FP_GET_PAYMENT = "https://faucetpay.io/merchant/get-payment"

interface FpPaymentInfo {
  valid?: boolean
  transaction_id?: string | number
  merchant_username?: string
  payer_username?: string
  amount1?: string | number
  currency1?: string
  amount2?: string | number
  currency2?: string
  custom?: string
}

function ack(message: string, status = 200) {
  // FaucetPay expects a plain-text response; non-200 triggers retries.
  return new NextResponse(message, { status })
}

async function verifyToken(token: string): Promise<FpPaymentInfo | null> {
  try {
    const res = await fetch(`${FP_GET_PAYMENT}/${encodeURIComponent(token)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as FpPaymentInfo
    return data?.valid ? data : null
  } catch {
    return null
  }
}

/** Decode our signed session token (same format as the create route). */
function decodeSession(
  token: string,
): { userId: string; amountUsd: number; orderId?: string; nonce?: string } | null {
  const secret =
    process.env.FAUCETPAY_IPN_SECRET?.trim() || process.env.FAUCETPAY_API_KEY?.trim() || ""
  if (!secret) return null
  try {
    const { createHmac } = require("node:crypto") as typeof import("node:crypto")
    const [body, sig] = token.split(".")
    if (!body || !sig) return null
    const expected = createHmac("sha256", secret).update(body).digest("base64url")
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !a.equals(b)) return null

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"))
    if (typeof payload.createdAt !== "number" || Date.now() - payload.createdAt > 24 * 60 * 60 * 1000) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const get = (k: string) => {
      const v = form.get(k)
      return typeof v === "string" ? v : ""
    }

    const token = get("token")
    const custom = get("custom")
    const status = get("status")

    if (!token || !custom) {
      log.warn("[fp-ipn] missing token or custom")
      return ack("ignored", 200) // don't retry-loop on malformed posts
    }

    const session = decodeSession(custom)
    if (!session?.userId) {
      log.warn("[fp-ipn] session signature invalid")
      return ack("rejected", 200)
    }

    // Server-to-server verification of the payment token.
    const info = await verifyToken(token)
    if (!info) {
      log.warn("[fp-ipn] token verification failed", { userId: session.userId })
      return ack("verification failed", 200)
    }

    // The verified record must reference OUR merchant account and match the
    // session's USD amount exactly.
    const merchantUsername = process.env.FAUCETPAY_MERCHANT_USERNAME?.trim() || ""
    if (merchantUsername && (info.merchant_username || "").toLowerCase() !== merchantUsername.toLowerCase()) {
      log.warn("[fp-ipn] merchant mismatch", {
        expected: merchantUsername,
        got: info.merchant_username,
      })
      return ack("merchant mismatch", 200)
    }

    const paidUsd = Number(info.amount1 ?? NaN)
    if (!Number.isFinite(paidUsd) || Math.abs(paidUsd - session.amountUsd) > 0.009) {
      log.warn("[fp-ipn] amount mismatch", { expected: session.amountUsd, got: info.amount1 })
      return ack("amount mismatch", 200)
    }

    if (status && status.toLowerCase() !== "completed" && status.toLowerCase() !== "success") {
      log.info("[fp-ipn] non-success status", { status })
      return ack("not completed", 200)
    }

    const admin = createAdminClient()
    if (!admin) return ack("service unavailable", 503)

    // Idempotent credit: mark the pending deposit completed only once.
    // Find by nonce embedded in the order id (or fall back to most recent
    // pending for this user+amount).
    let depositId: string | null = null
    if (session.nonce) {
      const { data } = await admin
        .from("ccpayment_deposits")
        .select("id, status, satoshis_credited")
        .eq("merchant_order_id", `FPD_${session.nonce}`)
        .eq("user_id", session.userId)
        .maybeSingle()
      depositId = data?.id ?? null
      if (data?.status === "completed") {
        return ack("already credited", 200)
      }
    }
    if (!depositId) {
      const { data } = await admin
        .from("ccpayment_deposits")
        .select("id, status")
        .eq("user_id", session.userId)
        .eq("amount_usd", session.amountUsd)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      depositId = data?.id ?? null
    }

    // Convert USD → sats at the rate implied by the actual payment
    // (amount2 crypto / exchange_rate reported by FaucetPay), falling back to
    // CoinGecko via the pricing module. Credit EXACTLY what was paid for.
    const { usdToSatoshis } = await import("@/lib/pricing/crypto-rates")
    let satoshisToCredit: number
    try {
      satoshisToCredit = (await usdToSatoshis(session.amountUsd)).satoshis
    } catch {
      log.error("[fp-ipn] live rate unavailable; will rely on FaucetPay retry", {
        userId: session.userId,
      })
      return ack("retry later", 503) // FaucetPay retries; we credit next time
    }

    // Atomic credit + ledger row via the audited safe_add_balance RPC
    // (row-locked balance update, transactions insert, idempotency built in).
    const txid = String(info.transaction_id ?? token)
    const idempotencyKey = `faucetpay_deposit:${txid}`
    const { data: creditResult, error: creditError } = await admin.rpc(
      "safe_add_balance",
      {
        p_user_id: session.userId,
        p_amount: satoshisToCredit,
        p_type: "deposit",
        p_description: `FaucetPay deposit $${session.amountUsd.toFixed(2)} (${info.currency2 || "crypto"})`,
        p_metadata: {
          provider: "faucetpay_merchant",
          fp_transaction_id: txid,
          payer: info.payer_username || null,
          amount_usd: session.amountUsd,
          currency2: info.currency2 || null,
          amount2: info.amount2 ? Number(info.amount2) : null,
          deposit_row_id: depositId,
          idempotency_key: idempotencyKey,
        },
        p_idempotency_key: idempotencyKey,
      },
    )

    if (creditError) {
      log.error("[fp-ipn] credit RPC failed", { error: creditError })
      return ack("retry later", 503)
    }
    if (!creditResult?.success) {
      const duplicate = /duplicate/i.test(creditResult?.error_message || "")
      if (!duplicate) {
        log.error("[fp-ipn] credit refused", { reason: creditResult?.error_message })
        return ack("refused", 503)
      }
    }

    if (depositId) {
      await admin
        .from("ccpayment_deposits")
        .update({
          status: "completed",
          tx_hash: txid,
          completed_at: new Date().toISOString(),
        })
        .eq("id", depositId)
        .eq("status", "pending")
    }

    await admin.from("notifications").insert({
      user_id: session.userId,
      type: "deposit_completed",
      title: "Deposit Successful",
      message: `Your FaucetPay deposit of $${session.amountUsd.toFixed(2)} has been credited.`,
      data: { fp_transaction_id: txid, satoshis: satoshisToCredit },
    })

    log.info("[fp-ipn] credited", {
      userId: session.userId,
      usd: session.amountUsd,
      sats: satoshisToCredit,
      txid,
    })

    return ack("Success")
  } catch (error) {
    log.error("[fp-ipn] unexpected error", { error })
    return ack("error", 500)
  }
}
