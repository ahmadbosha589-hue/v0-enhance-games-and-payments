import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient, getUser } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { createHmac, randomBytes } from "node:crypto"
import { log } from "@/lib/logger"

export const dynamic = "force-dynamic"

const depositSchema = z.object({
  amount: z.number().min(0.01).max(10000), // USD
  currency: z.enum(["BTC", "ETH", "LTC", "USDT"]).default("BTC"),
})

/**
 * POST /api/deposit/faucetpay
 *
 * Creates a FaucetPay Merchant payment for topping up the account balance.
 *
 * Flow (FaucetPay Merchant API):
 *   1. Server creates a payment record (pending) + signs an opaque session
 *      token binding {userId, amountUsd, currency, nonce}.
 *   2. Client is redirected to https://faucetpay.io/merchant/webscr with
 *      merchant_username, item_description, amount1 (USD), currency1 (USD),
 *      callback_url, success_url, cancel_url, custom=<session token>.
 *   3. FaucetPay POSTs the IPN to /api/deposit/faucetpay/callback with a
 *      one-time token; we verify it server-to-server via
 *      GET faucetpay.io/merchant/get-payment/{token} and only then credit.
 *
 * The MERCHANT_USERNAME comes from FAUCETPAY_MERCHANT_USERNAME env (the
 * FaucetPay account username that receives payments). Fail-closed: if not
 * configured, deposits return 503 and the callback never credits.
 */

const FP_MERCHANT_URL = "https://faucetpay.io/merchant/webscr"

function getMerchantUsername(): string | null {
  return process.env.FAUCETPAY_MERCHANT_USERNAME?.trim() || null
}

function signSession(payload: Record<string, unknown>): string {
  const secret = process.env.FAUCETPAY_IPN_SECRET?.trim() || process.env.FAUCETPAY_API_KEY?.trim() || ""
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const sig = createHmac("sha256", secret).update(body).digest("base64url")
  return `${body}.${sig}`
}

function verifySession(token: string): Record<string, unknown> | null {
  const secret = process.env.FAUCETPAY_IPN_SECRET?.trim() || process.env.FAUCETPAY_API_KEY?.trim() || ""
  if (!secret) return null
  const [body, sig] = token.split(".")
  if (!body || !sig) return null
  const expected = createHmac("sha256", secret).update(body).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !a.equals(b)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"))
    // 24h max age on sessions.
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
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const merchantUsername = getMerchantUsername()
    if (!merchantUsername) {
      return NextResponse.json(
        {
          error: "FaucetPay deposits are not enabled yet",
          code: "FAUCETPAY_DEPOSITS_DISABLED",
        },
        { status: 503 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const parsed = depositSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Amount must be $0.01 – $10,000", details: parsed.error.issues },
        { status: 400 },
      )
    }

    const { amount, currency } = parsed.data
    const admin = requireAdminClient()
    if (!admin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }

    const nonce = randomBytes(12).toString("hex")
    const sessionToken = signSession({
      userId: user.id,
      amountUsd: amount,
      currency,
      nonce,
      createdAt: Date.now(),
    })

    // Persist a pending deposit so the operator can see intent even before IPN.
    const merchantOrderId = `FPD_${nonce}`
    await admin.from("ccpayment_deposits").insert({
      user_id: user.id,
      merchant_order_id: merchantOrderId,
      ccpayment_order_id: merchantOrderId,
      amount_usd: amount,
      currency,
      purpose: "balance",
      status: "pending",
      pay_address: `faucetpay:${merchantUsername}`,
    })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

    // FaucetPay merchant form params (server-built; client just redirects).
    const params = new URLSearchParams({
      merchant_username: merchantUsername,
      item_description: `${process.env.NEXT_PUBLIC_SITE_NAME || "Faucero"} balance top-up ($${amount.toFixed(2)})`,
      amount1: amount.toFixed(2),
      currency1: "USD",
      callback_url: `${baseUrl}/api/deposit/faucetpay/callback`,
      success_url: `${baseUrl}/dashboard/withdrawals?deposit=success&order=${merchantOrderId}`,
      cancel_url: `${baseUrl}/dashboard/withdrawals?deposit=cancelled`,
      custom: sessionToken,
    })

    log.info("[fp-deposit] session created", {
      userId: user.id,
      amount,
      orderId: merchantOrderId,
    })

    return NextResponse.json({
      success: true,
      orderId: merchantOrderId,
      merchantUrl: `${FP_MERCHANT_URL}?${params.toString()}`,
      // The user pays in their chosen coin; FaucetPay converts at its own rate
      // and reports both amounts in the IPN.
      payCurrency: currency,
      amountUsd: amount,
      note: "You will be redirected to FaucetPay to complete the payment.",
    })
  } catch (error) {
    log.error("[fp-deposit] error", { error })
    return NextResponse.json({ error: "Failed to create deposit" }, { status: 500 })
  }
}

/** Exported for tests. */
export const __testables = process.env.NODE_ENV === "test" ? { verifySession } : undefined
