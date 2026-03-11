import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getCCPaymentClient } from "@/lib/ccpayment/client"
import { log } from "@/lib/logger"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"

const swapQuoteSchema = z.object({
  fromCoinId: z.string(),
  toCoinId: z.string(),
  amount: z.string()
})

const swapExecuteSchema = z.object({
  fromCoinId: z.string(),
  toCoinId: z.string(),
  amount: z.string(),
  quoteId: z.string().optional()
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

    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action") || "quote"
    const body = await request.json()

    const ccpayment = getCCPaymentClient()

    if (action === "quote") {
      const validatedData = swapQuoteSchema.safeParse(body)
      if (!validatedData.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 })
      }

      const { fromCoinId, toCoinId, amount } = validatedData.data
      
      try {
        const quote = await ccpayment.getSwapQuote(fromCoinId, toCoinId, amount)
        
        return NextResponse.json({
          success: true,
          quote: {
            fromCoinId: quote.fromCoinId,
            toCoinId: quote.toCoinId,
            fromAmount: quote.fromAmount,
            toAmount: quote.toAmount,
            rate: quote.rate,
            fee: quote.fee,
            validUntil: quote.validUntil
          }
        })
      } catch {
        // Fallback with simulated rates if API fails
        const mockRates: Record<string, Record<string, number>> = {
          BTC: { ETH: 16.5, USDT: 67000, LTC: 800, BNB: 110 },
          ETH: { BTC: 0.06, USDT: 4000, LTC: 48, BNB: 6.5 },
          USDT: { BTC: 0.000015, ETH: 0.00025, LTC: 0.012, BNB: 0.0016 },
          LTC: { BTC: 0.00125, ETH: 0.021, USDT: 83, BNB: 0.14 },
          BNB: { BTC: 0.009, ETH: 0.15, USDT: 620, LTC: 7.2 }
        }
        
        const rate = mockRates[fromCoinId]?.[toCoinId] || 1
        const toAmount = (parseFloat(amount) * rate).toFixed(8)
        const fee = (parseFloat(amount) * 0.005).toFixed(8) // 0.5% fee
        
        return NextResponse.json({
          success: true,
          quote: {
            fromCoinId,
            toCoinId,
            fromAmount: amount,
            toAmount,
            rate: rate.toString(),
            fee,
            validUntil: Date.now() + 60000, // 1 minute
            simulated: true
          }
        })
      }
    }

    if (action === "execute") {
      const validatedData = swapExecuteSchema.safeParse(body)
      if (!validatedData.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 })
      }

      const { fromCoinId, toCoinId, amount } = validatedData.data
      const merchantOrderId = `SWAP_${user.id}_${uuidv4()}`

      try {
        const swap = await ccpayment.executeSwap({
          coinFrom: fromCoinId,
          coinTo: toCoinId,
          amount,
          merchantOrderId
        })

        // Store swap record
        await supabase.from("ccpayment_swaps").insert({
          id: uuidv4(),
          user_id: user.id,
          merchant_order_id: merchantOrderId,
          ccpayment_order_id: swap.orderId,
          from_coin_id: fromCoinId,
          to_coin_id: toCoinId,
          from_amount: amount,
          status: swap.status
        })

        log.info("CCPayment swap executed", {
          userId: user.id,
          orderId: swap.orderId,
          fromCoinId,
          toCoinId,
          amount
        })

        return NextResponse.json({
          success: true,
          swap: {
            orderId: swap.orderId,
            status: swap.status
          }
        })
      } catch (ccError) {
        return NextResponse.json({ 
          error: ccError instanceof Error ? ccError.message : "Swap execution failed" 
        }, { status: 500 })
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    log.error("CCPayment swap error", { error })
    return NextResponse.json({ error: "Failed to process swap" }, { status: 500 })
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
      try {
        const ccpayment = getCCPaymentClient()
        const swap = await ccpayment.getSwapStatus(orderId)
        return NextResponse.json({ swap })
      } catch {
        return NextResponse.json({ error: "Swap not found" }, { status: 404 })
      }
    }

    // Get user's swap history
    const { data: swaps, error } = await supabase
      .from("ccpayment_swaps")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) {
      throw error
    }

    return NextResponse.json({ swaps })
  } catch (error) {
    log.error("CCPayment get swaps error", { error })
    return NextResponse.json({ error: "Failed to fetch swaps" }, { status: 500 })
  }
}
