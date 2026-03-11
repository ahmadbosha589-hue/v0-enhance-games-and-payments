import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getCCPaymentClient } from "@/lib/ccpayment/client"
import { log } from "@/lib/logger"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"

const withdrawSchema = z.object({
  coinId: z.string(),
  address: z.string().min(10),
  chain: z.string(),
  amountSatoshis: z.number().min(10000), // Minimum 10,000 satoshis
  memo: z.string().optional()
})

// Conversion rate (in a real app, fetch from exchange API)
const SATOSHI_TO_USD = 0.0000004 // Approximate, should be fetched dynamically

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = withdrawSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json({ error: "Invalid request", details: validatedData.error.issues }, { status: 400 })
    }

    const { coinId, address, chain, amountSatoshis, memo } = validatedData.data

    // Get user profile
    const { data: profile, error: profileError } = await adminSupabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Check balance
    if (Number(profile.balance_satoshis) < amountSatoshis) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 })
    }

    // Check if account is flagged
    if (profile.is_flagged && profile.fraud_score >= 50) {
      return NextResponse.json({ error: "Account under review. Withdrawals disabled." }, { status: 403 })
    }

    // Convert satoshis to USD for withdrawal
    const amountUsd = amountSatoshis * SATOSHI_TO_USD
    const merchantOrderId = `CCWITHDRAW_${user.id}_${uuidv4()}`

    try {
      const ccpayment = getCCPaymentClient()
      
      const withdrawal = await ccpayment.withdraw({
        coinId,
        address,
        chain,
        amount: amountUsd.toFixed(6),
        merchantOrderId,
        memo
      })

      // Deduct from balance
      const newBalance = Number(profile.balance_satoshis) - amountSatoshis
      await adminSupabase
        .from("profiles")
        .update({ 
          balance_satoshis: newBalance,
          total_withdrawn_satoshis: Number(profile.total_withdrawn_satoshis) + amountSatoshis
        })
        .eq("id", user.id)

      // Store withdrawal record
      await adminSupabase.from("ccpayment_withdrawals").insert({
        id: uuidv4(),
        user_id: user.id,
        merchant_order_id: merchantOrderId,
        ccpayment_order_id: withdrawal.orderId,
        amount_satoshis: amountSatoshis,
        amount_crypto: amountUsd.toFixed(6),
        coin_id: coinId,
        chain,
        address,
        memo,
        status: "pending",
        fee: withdrawal.fee
      })

      // Create transaction record
      await adminSupabase.from("transactions").insert({
        user_id: user.id,
        type: "withdrawal",
        status: "pending",
        amount_satoshis: -amountSatoshis,
        balance_before: profile.balance_satoshis,
        balance_after: newBalance,
        description: `CCPayment withdrawal to ${coinId}`,
        metadata: { 
          ccpayment_order_id: withdrawal.orderId,
          address,
          coin_id: coinId,
          chain
        },
        idempotency_key: `tx_${merchantOrderId}`
      })

      // Create notification
      await adminSupabase.from("notifications").insert({
        user_id: user.id,
        type: "withdrawal_pending",
        title: "Crypto Withdrawal Requested",
        message: `Your withdrawal of ${amountSatoshis.toLocaleString()} satoshis to ${coinId} is being processed.`,
        data: { withdrawal_id: withdrawal.orderId }
      })

      log.info("CCPayment withdrawal created", {
        userId: user.id,
        orderId: withdrawal.orderId,
        amount: amountSatoshis,
        coinId
      })

      return NextResponse.json({
        success: true,
        withdrawal: {
          orderId: withdrawal.orderId,
          status: withdrawal.status,
          amountSatoshis,
          coinId,
          chain,
          fee: withdrawal.fee
        },
        newBalance
      })
    } catch (ccError) {
      log.error("CCPayment withdrawal API error", { error: ccError })
      return NextResponse.json({ 
        error: ccError instanceof Error ? ccError.message : "CCPayment API error" 
      }, { status: 500 })
    }
  } catch (error) {
    log.error("CCPayment withdrawal error", { error })
    return NextResponse.json({ error: "Failed to process withdrawal" }, { status: 500 })
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

    // Get supported coins for withdrawal
    const { searchParams } = new URL(request.url)
    
    if (searchParams.get("coins") === "true") {
      try {
        const ccpayment = getCCPaymentClient()
        const coins = await ccpayment.getSupportedCoins()
        return NextResponse.json({ coins })
      } catch {
        // Return default coins if API fails
        return NextResponse.json({ 
          coins: [
            { coinId: "BTC", symbol: "BTC", name: "Bitcoin", chains: [{ chainId: "BTC", chainName: "Bitcoin", minWithdrawAmount: "0.0001", withdrawFee: "0.00005" }] },
            { coinId: "ETH", symbol: "ETH", name: "Ethereum", chains: [{ chainId: "ETH", chainName: "Ethereum", minWithdrawAmount: "0.01", withdrawFee: "0.005" }] },
            { coinId: "USDT", symbol: "USDT", name: "Tether", chains: [{ chainId: "TRC20", chainName: "Tron", minWithdrawAmount: "10", withdrawFee: "1" }] },
            { coinId: "LTC", symbol: "LTC", name: "Litecoin", chains: [{ chainId: "LTC", chainName: "Litecoin", minWithdrawAmount: "0.001", withdrawFee: "0.0001" }] }
          ]
        })
      }
    }

    // Get user's withdrawal history
    const { data: withdrawals, error } = await supabase
      .from("ccpayment_withdrawals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) {
      throw error
    }

    return NextResponse.json({ withdrawals })
  } catch (error) {
    log.error("CCPayment get withdrawals error", { error })
    return NextResponse.json({ error: "Failed to fetch withdrawals" }, { status: 500 })
  }
}
