import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getCCPaymentClient } from "@/lib/ccpayment/client"
import { log } from "@/lib/logger"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"
import { requireAdminClient } from "@/lib/supabase/admin-client"

const depositSchema = z.object({
  amount: z.number().min(1).max(10000),
  currency: z.string().default("USD"),
  coinId: z.string().optional(),
  chain: z.string().optional(),
  purpose: z.enum(["balance", "advertising"]).default("balance")
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = depositSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json({ error: "Invalid request", details: validatedData.error.issues }, { status: 400 })
    }

    const { amount, currency, coinId, chain, purpose } = validatedData.data

    const ccpayment = getCCPaymentClient()
    const merchantOrderId = `DEP_${user.id}_${uuidv4()}`
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000"

    let order

    if (coinId && chain) {
      // Native checkout with specific coin
      order = await ccpayment.createNativeOrder({
        productPrice: amount.toString(),
        currency,
        merchantOrderId,
        coinId,
        chain,
        notifyUrl: `${baseUrl}/api/ccpayment/webhook`,
        returnUrl: `${baseUrl}/dashboard/${purpose === "advertising" ? "advertise" : "withdrawals"}?deposit=success`,
        productName: purpose === "advertising" ? "Advertising Deposit" : "Account Deposit"
      })
    } else {
      // Hosted checkout
      order = await ccpayment.createOrder({
        productPrice: amount.toString(),
        currency,
        merchantOrderId,
        notifyUrl: `${baseUrl}/api/ccpayment/webhook`,
        returnUrl: `${baseUrl}/dashboard/${purpose === "advertising" ? "advertise" : "withdrawals"}?deposit=success`,
        productName: purpose === "advertising" ? "Advertising Deposit" : "Account Deposit",
        customValue: JSON.stringify({ userId: user.id, purpose })
      })
    }

    // Store the deposit record
    const adminSupabase = requireAdminClient()
    await adminSupabase.from("ccpayment_deposits").insert({
      id: uuidv4(),
      user_id: user.id,
      merchant_order_id: merchantOrderId,
      ccpayment_order_id: order.orderId,
      amount_usd: amount,
      currency,
      coin_id: coinId,
      chain,
      purpose,
      status: "pending",
      pay_address: order.payAddress,
      payment_amount: order.paymentAmount,
      expires_at: new Date(order.expiresAt * 1000).toISOString()
    })

    log.info("CCPayment deposit created", {
      userId: user.id,
      orderId: order.orderId,
      amount,
      purpose
    })

    return NextResponse.json({
      success: true,
      order: {
        orderId: order.orderId,
        payAddress: order.payAddress,
        paymentAmount: order.paymentAmount,
        currency: order.currency,
        expiresAt: order.expiresAt,
        qrCodeUrl: order.qrCodeUrl
      }
    })
  } catch (error) {
    log.error("CCPayment deposit error", { error })
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to create deposit" 
    }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get("orderId")

    if (orderId) {
      // Get specific order status
      const ccpayment = getCCPaymentClient()
      const order = await ccpayment.getOrderStatus(orderId)
      return NextResponse.json({ order })
    }

    // Get user's deposit history
    const { data: deposits, error } = await supabase
      .from("ccpayment_deposits")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) {
      throw error
    }

    return NextResponse.json({ deposits })
  } catch (error) {
    log.error("CCPayment get deposits error", { error })
    return NextResponse.json({ error: "Failed to fetch deposits" }, { status: 500 })
  }
}
