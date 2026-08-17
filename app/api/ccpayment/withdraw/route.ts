import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getCCPaymentClient } from "@/lib/ccpayment/client"
import { log } from "@/lib/logger"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"
import { requireAdminClient } from "@/lib/supabase/admin-client"

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
    const adminSupabase = requireAdminClient()

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
      return NextResponse.json({ error: "Unable to load your profile. Please refresh the page and try again." }, { status: 404 })
    }

    // Check balance
    if (Number(profile.balance_satoshis) < amountSatoshis) {
      const shortage = amountSatoshis - Number(profile.balance_satoshis)
      return NextResponse.json({
        error: `Insufficient balance. You need ${shortage.toLocaleString()} more satoshis to complete this withdrawal.`
      }, { status: 400 })
    }

    // Check if account is flagged
    if (profile.is_flagged && profile.fraud_score >= 50) {
      return NextResponse.json({
        error: "Your account is currently under review. Withdrawals are temporarily disabled. Please contact support if you need assistance."
      }, { status: 403 })
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

      // Extract meaningful error message for user
      let userMessage = "CCPayment service encountered an error. Please try again later."
      if (ccError instanceof Error) {
        const errorLower = ccError.message.toLowerCase()
        if (errorLower.includes("address") || errorLower.includes("invalid")) {
          userMessage = "Invalid wallet address. Please check the address and network match correctly."
        } else if (errorLower.includes("amount") || errorLower.includes("minimum")) {
          userMessage = "Withdrawal amount is below the minimum for this cryptocurrency."
        } else if (errorLower.includes("insufficient") || errorLower.includes("funds")) {
          userMessage = "CCPayment service has insufficient funds. Please try a smaller amount or different cryptocurrency."
        } else if (errorLower.includes("network") || errorLower.includes("chain")) {
          userMessage = "Selected network is not available. Please choose a different network."
        } else if (errorLower.includes("api") || errorLower.includes("key")) {
          userMessage = "CCPayment service is temporarily unavailable. Please try again later or use FaucetPay withdrawal."
        } else if (ccError.message) {
          userMessage = ccError.message
        }
      }

      return NextResponse.json({ error: userMessage }, { status: 500 })
    }
  } catch (error) {
    log.error("CCPayment withdrawal error", { error })
    return NextResponse.json({
      error: "Something went wrong processing your withdrawal. Please try again or contact support if the issue persists."
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
