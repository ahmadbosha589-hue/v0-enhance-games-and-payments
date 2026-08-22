import { NextResponse } from "next/server"
import { createClient, getVerifiedUser } from "@/lib/supabase/server"
import { requireAdminClient, ServiceUnavailableError } from "@/lib/supabase/admin-client"
import {
  getCCPaymentClient,
  usdToSatoshis,
  type CCPaymentClient,
  type CCPaymentSwapRecord,
} from "@/lib/ccpayment/client"
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

const UNCONFIGURED_ERROR =
  "Live swap service is not configured. Set CCPAYMENT_APP_ID and CCPAYMENT_APP_SECRET to enable swaps."

function unconfiguredResponse() {
  return NextResponse.json(
    { error: UNCONFIGURED_ERROR, code: "CCPAYMENT_NOT_CONFIGURED" },
    { status: 503 },
  )
}

/** Resolves the provider client without throwing; null means credentials are missing. */
function resolveCCPaymentClient(): CCPaymentClient | null {
  try {
    return getCCPaymentClient()
  } catch (error) {
    log.warn("CCPayment client unavailable", { error })
    return null
  }
}

/**
 * Server-side satoshi valuation of the requested spend. The client never gets
 * to state how many satoshis a swap costs — we price it from the provider's
 * own USDT price for the input coin and the platform's canonical BTC price.
 */
async function estimateSatoshiDebit(
  ccpayment: CCPaymentClient,
  fromCoinId: string,
  amount: string,
): Promise<number> {
  const prices = await ccpayment.getCoinUSDTPrices([fromCoinId])
  const fromPriceUsd = Number(prices[String(fromCoinId)] ?? prices[String(Number(fromCoinId))])
  if (!Number.isFinite(fromPriceUsd) || fromPriceUsd <= 0) {
    throw new Error("Unable to price the swap input coin")
  }

  const usdValue = fromPriceUsd * Number(amount)
  if (!Number.isFinite(usdValue) || usdValue <= 0) {
    throw new Error("Unable to value the swap amount")
  }

  const satoshis = await usdToSatoshis(usdValue)
  if (!Number.isFinite(satoshis) || satoshis <= 0) {
    throw new Error("Unable to value the swap amount in satoshis")
  }
  return Math.max(1, Math.floor(satoshis))
}

interface SwapDebitResult {
  success?: boolean
  error?: string
  message?: string
  balance?: number
  required?: number
  satoshis_debited?: number
  new_balance?: number
  swap_id?: string
}

export async function POST(request: Request) {
  try {
    // Privileged (money-moving) path: force one live session check.
    const user = await getVerifiedUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action") || "quote"
    const body = await request.json()

    // Fail closed when CCPayment credentials are missing — never simulate.
    const ccpayment = resolveCCPaymentClient()
    if (!ccpayment) {
      return unconfiguredResponse()
    }

    if (action === "coins") {
      // Real provider coin ids so the dashboard can build valid swap pairs.
      try {
        const coins = await ccpayment.getSupportedCoins()
        return NextResponse.json({
          success: true,
          coins: coins.map((coin) => ({
            coinId: String(coin.coinId),
            symbol: coin.symbol,
            name: coin.name,
            price: coin.price,
            chains: coin.chains
          }))
        })
      } catch (error) {
        log.warn("CCPayment coin list unavailable", { error })
        return NextResponse.json({ error: "Live coin list is temporarily unavailable" }, { status: 503 })
      }
    }

    if (action === "quote") {
      const validatedData = swapQuoteSchema.safeParse(body)
      if (!validatedData.success) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 })
      }

      const { fromCoinId, toCoinId, amount } = validatedData.data

      try {
        const quote = await ccpayment.getSwapQuote(fromCoinId, toCoinId, amount)

        // Display-only estimate of the satoshi cost; the authoritative figure
        // is computed again at execution time.
        let estimatedSatoshis: number | undefined
        try {
          estimatedSatoshis = await estimateSatoshiDebit(ccpayment, fromCoinId, amount)
        } catch (pricingError) {
          log.warn("Swap satoshi estimate unavailable", { pricingError })
        }

        return NextResponse.json({
          success: true,
          quote: {
            fromCoinId: quote.fromCoinId,
            toCoinId: quote.toCoinId,
            fromAmount: quote.fromAmount,
            toAmount: quote.toAmount,
            rate: quote.rate,
            fee: quote.fee,
            validUntil: quote.validUntil,
            estimatedSatoshis
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

      // All balance mutations go through the service-role client.
      const admin = requireAdminClient()
      const { fromCoinId, toCoinId, amount } = validatedData.data
      const merchantOrderId = `SWAP_${user.id}_${uuidv4()}`

      try {
        // 1) Fresh server-side quote; the client's numbers are advisory only.
        const quote = await ccpayment.getSwapQuote(fromCoinId, toCoinId, amount)
        if (!quote.validUntil || quote.validUntil <= Date.now()) {
          return NextResponse.json({ error: "Swap quote expired; request a new quote" }, { status: 409 })
        }

        // 2) Convert the requested amount to satoshis on the server. Client
        //    amounts are never trusted to state the debit.
        const satoshisDebit = await estimateSatoshiDebit(ccpayment, fromCoinId, amount)

        // 3) Atomically debit the user's satoshi balance, insert the swap row
        //    as 'pending_debit', and write the 'swap_debit' ledger entry.
        const { data: debitData, error: debitError } = await admin.rpc("execute_user_swap", {
          p_user_id: user.id,
          p_merchant_order_id: merchantOrderId,
          p_from_coin_id: fromCoinId,
          p_to_coin_id: toCoinId,
          p_from_amount: amount,
          p_to_amount: quote.toAmount,
          p_rate: quote.rate,
          p_fee: quote.fee,
          p_satoshis_debit: satoshisDebit,
        })

        if (debitError) {
          log.error("Swap debit RPC failed", { userId: user.id, merchantOrderId, error: debitError })
          return NextResponse.json(
            { error: "Could not reserve your satoshi balance for this swap. No funds were moved." },
            { status: 500 },
          )
        }

        const debit = (debitData as SwapDebitResult | null) ?? null
        if (!debit?.success) {
          if (debit?.error === "INSUFFICIENT_BALANCE") {
            return NextResponse.json(
              {
                error: "Insufficient satoshi balance for this swap",
                balance: debit.balance,
                required: debit.required
              },
              { status: 400 },
            )
          }
          log.warn("Swap debit rejected", { userId: user.id, merchantOrderId, result: debit })
          return NextResponse.json(
            { error: debit?.message || "Swap could not be started" },
            { status: 400 },
          )
        }

        // 4) The debit is committed — only now settle against the provider.
        let swap: CCPaymentSwapRecord
        try {
          swap = await ccpayment.executeSwap({
            coinFrom: fromCoinId,
            coinTo: toCoinId,
            amount,
            merchantOrderId,
            amountOutMinimum: quote.amountOutMinimum || quote.toAmount,
          })
        } catch (providerError) {
          const reason = providerError instanceof Error
            ? providerError.message.slice(0, 500)
            : "Provider settlement failed"
          log.warn("Provider swap failed; refunding user debit", {
            userId: user.id,
            merchantOrderId,
            reason
          })

          // 4a) Restore the user's satoshis and flag the swap refunded.
          const { data: refundData, error: refundError } = await admin.rpc("refund_user_swap", {
            p_user_id: user.id,
            p_merchant_order_id: merchantOrderId,
            p_reason: reason,
          })

          if (refundError || !(refundData as { success?: boolean } | null)?.success) {
            log.error("Swap refund failed — manual reconciliation required", {
              userId: user.id,
              merchantOrderId,
              refundError,
              refundData
            })
            return NextResponse.json(
              {
                error:
                  "The swap failed and your satoshis could not be refunded automatically. Support will restore your balance; keep this order reference.",
                orderId: merchantOrderId
              },
              { status: 502 },
            )
          }

          return NextResponse.json(
            {
              error: `Swap failed at the provider: ${reason}. Your satoshi balance has been fully refunded.`,
              refunded: true,
              orderId: merchantOrderId
            },
            { status: 502 },
          )
        }

        // 5) Provider accepted the swap: mark it completed and record the
        //    'swap_settlement' ledger row atomically.
        const { data: settleData, error: settleError } = await admin.rpc("settle_user_swap", {
          p_user_id: user.id,
          p_merchant_order_id: merchantOrderId,
          p_ccpayment_order_id: swap.orderId,
          p_to_amount: swap.toAmount || quote.toAmount,
          p_tx_hash: swap.txHash ?? null,
        })

        const settlementLedgerPending = Boolean(settleError) || !(settleData as { success?: boolean } | null)?.success
        if (settlementLedgerPending) {
          log.error("Swap settled at provider but settlement ledger update failed", {
            userId: user.id,
            merchantOrderId,
            orderId: swap.orderId,
            settleError,
            settleData
          })
        }

        log.info("CCPayment user swap executed", {
          userId: user.id,
          orderId: swap.orderId,
          merchantOrderId,
          fromCoinId,
          toCoinId,
          amount,
          satoshisDebited: debit.satoshis_debited ?? satoshisDebit
        })

        return NextResponse.json({
          success: true,
          swap: {
            swapId: debit.swap_id,
            orderId: swap.orderId,
            status: "completed",
            toAmount: swap.toAmount || quote.toAmount,
            rate: quote.rate
          },
          satoshisDebited: debit.satoshis_debited ?? satoshisDebit,
          newBalance: debit.new_balance ?? null,
          settlementLedgerPending
        })
      } catch (error) {
        // Any failure before the debit RPC commits leaves no money moved.
        log.warn("CCPayment swap unavailable", { error })
        return NextResponse.json({ error: "Live swap execution is temporarily unavailable" }, { status: 503 })
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      log.error("CCPayment swap database unavailable", { error })
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    log.error("CCPayment swap error", { error })
    return NextResponse.json({ error: "Failed to process swap" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const user = await getVerifiedUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get("orderId")

    if (orderId) {
      const ccpayment = resolveCCPaymentClient()
      if (!ccpayment) {
        return unconfiguredResponse()
      }
      try {
        const swap = await ccpayment.getSwapStatus(orderId)
        return NextResponse.json({ swap })
      } catch {
        return NextResponse.json({ error: "Swap not found" }, { status: 404 })
      }
    }

    // Get user's swap history
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 })
    }

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
    if (error instanceof ServiceUnavailableError) {
      log.error("CCPayment get swaps database unavailable", { error })
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    log.error("CCPayment get swaps error", { error })
    return NextResponse.json({ error: "Failed to fetch swaps" }, { status: 500 })
  }
}
