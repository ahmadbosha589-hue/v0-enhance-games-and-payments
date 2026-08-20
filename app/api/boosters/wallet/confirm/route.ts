import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import {
  decimalToBaseUnits,
  getWalletPaymentConfig,
  isVerifiedErc20Transfer,
} from "@/lib/wallet/evm-payment"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  orderId: z.string().min(3).max(100),
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
})

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Wallet RPC returned HTTP ${response.status}`)
  const payload = await response.json() as { result?: T; error?: { message?: string } }
  if (payload.error) throw new Error(payload.error.message || "Wallet RPC request failed")
  return payload.result as T
}

function tokenAmountForPurchase(amountUsd: number, tokenUsdRate: string, decimals: number): string {
  const tokenAmount = amountUsd / Number(tokenUsdRate)
  if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) throw new Error("Invalid wallet payment amount")
  return decimalToBaseUnits(tokenAmount.toFixed(decimals), decimals)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = requireAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const config = getWalletPaymentConfig()
    if (!config) {
      return NextResponse.json({ error: "Direct wallet payments are not configured" }, { status: 503 })
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Invalid wallet confirmation request" }, { status: 400 })
    const { orderId, transactionHash } = parsed.data

    const { data: scopedPurchase, error: scopedPurchaseError } = await adminSupabase
      .from("booster_purchases")
      .select("id, user_id, booster_tier_id, payment_status, payment_reference, amount_usd, created_at, transaction_hash")
      .eq("user_id", user.id)
      .eq("payment_reference", orderId)
      .maybeSingle()

    if (scopedPurchaseError) {
      return NextResponse.json({ error: "Unable to load wallet payment order" }, { status: 503 })
    }
    const activePurchase = scopedPurchase
    if (!activePurchase) return NextResponse.json({ error: "Wallet payment order not found" }, { status: 404 })

    if (activePurchase.payment_status === "completed") {
      return NextResponse.json({ success: true, paymentCompleted: true, orderId })
    }
    if (activePurchase.payment_status !== "pending") {
      return NextResponse.json({ error: "Wallet payment order is no longer payable" }, { status: 409 })
    }

    const createdAt = activePurchase.created_at ? Date.parse(activePurchase.created_at) : NaN
    if (Number.isFinite(createdAt) && Date.now() - createdAt > 60 * 60 * 1000) {
      await adminSupabase.from("booster_purchases").update({ payment_status: "failed" }).eq("id", activePurchase.id).eq("payment_status", "pending")
      return NextResponse.json({ error: "Wallet payment order has expired" }, { status: 410 })
    }

    const expectedBaseUnits = tokenAmountForPurchase(Number(activePurchase.amount_usd), config.tokenUsdRate, config.tokenDecimals)
    const { error: transactionHashError } = await adminSupabase
      .from("booster_purchases")
      .update({ transaction_hash: transactionHash })
      .eq("id", activePurchase.id)
      .eq("payment_status", "pending")
    if (transactionHashError) {
      if (/duplicate|unique/i.test(transactionHashError.message)) {
        return NextResponse.json({ error: "This blockchain transaction is already linked to another payment order" }, { status: 409 })
      }
      return NextResponse.json({ error: "Unable to record wallet transaction" }, { status: 503 })
    }

    const chainIdHex = await rpcCall<string>(config.rpcUrl, "eth_chainId", [])
    if (Number.parseInt(chainIdHex, 16) !== config.chainId) {
      return NextResponse.json({ error: "Configured wallet network does not match the payment chain" }, { status: 503 })
    }

    const transaction = await rpcCall<{ to?: string; from?: string; blockNumber?: string } | null>(config.rpcUrl, "eth_getTransactionByHash", [transactionHash])
    if (!transaction) {
      return NextResponse.json({ success: false, pending: true, confirmations: 0, requiredConfirmations: config.confirmations }, { status: 202 })
    }

    const receipt = await rpcCall<{
      status?: string
      blockNumber?: string
      logs?: Array<{ address?: string; topics?: string[]; data?: string }>
    } | null>(config.rpcUrl, "eth_getTransactionReceipt", [transactionHash])
    if (!receipt) {
      return NextResponse.json({ success: false, pending: true, confirmations: 0, requiredConfirmations: config.confirmations }, { status: 202 })
    }

    if (receipt.status?.toLowerCase() !== "0x1") {
      await adminSupabase.from("booster_purchases").update({ payment_status: "failed" }).eq("id", activePurchase.id).eq("payment_status", "pending")
      return NextResponse.json({ error: "Wallet transaction failed on-chain" }, { status: 400 })
    }

    const latestBlockHex = await rpcCall<string>(config.rpcUrl, "eth_blockNumber", [])
    const transactionBlock = Number.parseInt(receipt.blockNumber || "0x0", 16)
    const latestBlock = Number.parseInt(latestBlockHex, 16)
    const confirmations = transactionBlock > 0 ? Math.max(0, latestBlock - transactionBlock + 1) : 0

    if (!isVerifiedErc20Transfer(receipt, {
      tokenAddress: config.tokenAddress,
      destinationAddress: config.destinationAddress,
      minimumBaseUnits: expectedBaseUnits,
    })) {
      return NextResponse.json({ error: "Transaction does not match the configured token, destination, or amount" }, { status: 400 })
    }

    if (confirmations < config.confirmations) {
      return NextResponse.json({ success: false, pending: true, confirmations, requiredConfirmations: config.confirmations }, { status: 202 })
    }

    const { data: activation, error: activationError } = await adminSupabase.rpc(
      "activate_booster_purchase",
      { p_payment_reference: orderId, p_transaction_hash: transactionHash },
    )
    if (activationError || !activation?.success) {
      return NextResponse.json({ error: "Wallet payment verified but booster activation is temporarily unavailable" }, { status: 503 })
    }

    if (!activation.already_active) {
      await adminSupabase.from("notifications").insert({
        user_id: user.id,
        type: "booster_activated",
        title: "Booster Activated",
        message: "Your wallet payment was confirmed and your booster is now active.",
        data: { purchase_id: activePurchase.id, transaction_hash: transactionHash },
      })
    }

    return NextResponse.json({ success: true, paymentCompleted: true, orderId, confirmations })
  } catch (error) {
    console.error("Wallet payment confirmation error:", error)
    return NextResponse.json({ error: "Unable to verify wallet payment" }, { status: 503 })
  }
}
