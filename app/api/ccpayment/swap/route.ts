import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getCCPaymentClient } from "@/lib/ccpayment/client"
import { log } from "@/lib/logger"
import { v4 as uuidv4 } from "uuid"
import { z } from "zod"

const swapQuoteSchema = z.object({
  fromCoinId: z.string().min(1),
  toCoinId: z.string().min(1),
  amount: z.string().refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, "Amount must be positive")
})

const swapExecuteSchema = z.object({
  fromCoinId: z.string().min(1),
  toCoinId: z.string().min(1),
  amount: z.string().refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, "Amount must be positive"),
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
      } catch (error) {
        log.warn("CCPayment quote unavailable", { error })
        return NextResponse.json({ error: "Live swap quotes are temporarily unavailable" }, { status: 503 })
      }
    }

    if (action === "execute") {
      const validatedData = swapExecuteSchema.safeParse(body)
      if (!validatedData.success) {
        return NextResponse.json({ error: "Invalid request", details: validatedData.error.issues }, { status: 400 })
      }

      const { fromCoinId, toCoinId, amount } = validatedData.data
      const merchantOrderId = `SWAP_${user.id}_${uuidv4()}`

      try {
        const quote = await ccpayment.getSwapQuote(fromCoinId, toCoinId, amount)
        if (!quote.validUntil || quote.validUntil <= Date.now()) {
          return NextResponse.json({ error: "Swap quote expired; request a new quote" }, { status: 409 })
        }

        const swap = await ccpayment.executeSwap({
          coinFrom: fromCoinId,
          coinTo: toCoinId,
          amount,
          merchantOrderId
        })

        const { error: insertError } = await supabase.from("ccpayment_swaps").insert({
          id: uuidv4(),
          user_id: user.id,
          merchant_order_id: merchantOrderId,
          ccpayment_order_id: swap.orderId,
          from_coin_id: fromCoinId,
          to_coin_id: toCoinId,
          from_amount: amount,
          to_amount: quote.toAmount,
          rate: quote.rate,
          fee: quote.fee,
          status: swap.status || "processing"
        })
        if (insertError) throw insertError

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
            status: swap.status || "processing",
            toAmount: quote.toAmount,
            rate: quote.rate
          }
        })
      } catch (error) {
        log.warn("CCPayment swap unavailable", { error })
        return NextResponse.json({ error: "Live swap execution is temporarily unavailable" }, { status: 503 })
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
