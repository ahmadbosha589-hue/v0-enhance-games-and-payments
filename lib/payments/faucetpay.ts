import { createAdminClient } from "@/lib/supabase/server"
import { log } from "@/lib/logger"

/**
 * Shared FaucetPay payout helper.
 *
 * Extracted so every FaucetPay send path (support-us, ad-balance cashout,
 * future features) uses one implementation with consistent error mapping,
 * timeouts, and logging.
 */

const FAUCETPAY_API_URL = "https://faucetpay.io/api/v1"

export interface FaucetPaySendResult {
  success: boolean
  payoutId?: string
  error?: string
  balance?: number
}

/** Get the FaucetPay API key from system_settings (DB) or env. */
export async function getFaucetPayApiKey(): Promise<string | null> {
  const admin = createAdminClient()
  if (admin) {
    try {
      const { data } = await admin
        .from("system_settings")
        .select("value")
        .eq("key", "faucetpay_api_key")
        .single()
      const dbKey = (data?.value as string | null)?.trim()
      if (dbKey) return dbKey
    } catch {
      /* fall through to env */
    }
  }
  return process.env.FAUCETPAY_API_KEY?.trim() || null
}

export async function sendFaucetPayPayment(
  apiKey: string,
  toEmail: string,
  amountSmallestUnit: number,
  currency: string,
  ipAddress: string,
): Promise<FaucetPaySendResult> {
  try {
    const formData = new URLSearchParams({
      api_key: apiKey,
      to: toEmail,
      amount: String(amountSmallestUnit),
      currency,
      ip_address: ipAddress,
      referral: "false",
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(`${FAUCETPAY_API_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    const result = (await response.json()) as {
      status?: number
      message?: string
      payout_id?: string | number
      balance?: number
    }

    log.info("FaucetPay send response", {
      to: toEmail.slice(0, 3) + "***",
      amount: amountSmallestUnit,
      currency,
      status: result.status,
    })

    if (result.status === 200) {
      return {
        success: true,
        payoutId: result.payout_id ? String(result.payout_id) : undefined,
        balance: result.balance,
      }
    }

    // Map FaucetPay numeric statuses to user-friendly messages.
    const errorMessages: Record<number, string> = {
      400: "FaucetPay API error. Please contact support.",
      401: "FaucetPay API key is invalid. Please contact support.",
      402: "Payout wallet is temporarily out of funds. Please try again later.",
      403: "FaucetPay payouts are temporarily disabled.",
      405: "Too many requests. Please wait a moment and try again.",
      410: "Invalid recipient address. Please check the FaucetPay email.",
      450: `${currency} is not supported by FaucetPay.`,
      456: "Your FaucetPay email is not registered.",
      457: "Payout amount is too small for the FaucetPay minimum.",
      458: "Daily payout limit reached. Please try again tomorrow.",
      459: "Referral payout limit reached.",
      460: "Your FaucetPay account is suspended.",
      461: `Your FaucetPay account cannot receive ${currency}.`,
    }
    const errorMessage =
      (result.status ? errorMessages[result.status] : undefined) ||
      result.message ||
      "FaucetPay payment failed"
    return { success: false, error: errorMessage }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "FaucetPay request timed out. Please try again." }
    }
    log.error("FaucetPay send exception", { error })
    return { success: false, error: "Failed to connect to FaucetPay. Please try again." }
  }
}
