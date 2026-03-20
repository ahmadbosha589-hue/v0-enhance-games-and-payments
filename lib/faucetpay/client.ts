import { log } from "@/lib/logger"

interface FaucetPayConfig {
  apiKey: string
  currency?: string
}

interface FaucetPayResponse {
  status: number
  message: string
  payout_id?: string
  payout_user_hash?: string
  balance?: number
}

interface CheckAddressResponse {
  status: number
  message: string
  payout_user_hash?: string
}

interface BalanceResponse {
  status: number
  message: string
  currency: string
  balance: number
  balance_bitcoin: number
}

// FaucetPay supported currencies
export const FAUCETPAY_SUPPORTED_CURRENCIES = [
  "BTC", "LTC", "ETH", "DOGE", "BCH", "DASH", "DGB", "TRX", "FEY", "ZEC",
  "BNB", "SOL", "XRP", "MATIC", "ADA", "TON", "USDT", "SHIB", "USDC"
]

// FaucetPay error code to user-friendly message mapping
export const FAUCETPAY_ERROR_MESSAGES: Record<number, string> = {
  400: "FaucetPay API error. Please contact support.",
  401: "FaucetPay API key is invalid. Please contact support.",
  402: "Faucet is temporarily out of funds. Please try again later.",
  403: "FaucetPay payouts are temporarily disabled.",
  405: "Too many requests. Please wait a moment and try again.",
  450: "Currency is not supported by FaucetPay.",
  456: "Your email is not registered on FaucetPay. Please create a FaucetPay account first.",
  457: "Payout amount is too small for FaucetPay minimum.",
  458: "Daily payout limit reached. Please try again tomorrow.",
  459: "Referral payout limit reached.",
  460: "Your FaucetPay account is suspended.",
  461: "Your FaucetPay account cannot receive this currency. Please link the currency on FaucetPay.",
}

export class FaucetPayError extends Error {
  public readonly statusCode: number
  public readonly isUserError: boolean

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = "FaucetPayError"
    this.statusCode = statusCode
    // User errors are ones they can fix (email not registered, account suspended, etc.)
    this.isUserError = [456, 460, 461].includes(statusCode)
  }
}

export class FaucetPayClient {
  private apiKey: string
  private baseUrl = "https://faucetpay.io/api/v1"
  private currency: string
  private timeout = 15000 // 15 second timeout

  constructor(config: FaucetPayConfig) {
    this.apiKey = config.apiKey
    this.currency = config.currency || "BTC"
  }

  private async request<T>(endpoint: string, data: Record<string, string | number>): Promise<T> {
    const formData = new URLSearchParams()
    formData.append("api_key", this.apiKey)

    for (const [key, value] of Object.entries(data)) {
      formData.append(key, String(value))
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new FaucetPayError(`FaucetPay API HTTP error: ${response.status}`, response.status)
      }

      return response.json() as Promise<T>
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === "AbortError") {
        throw new FaucetPayError("FaucetPay request timed out. Please try again.", 408)
      }
      throw error
    }
  }

  async checkAddress(address: string): Promise<CheckAddressResponse> {
    const response = await this.request<CheckAddressResponse>("/checkaddress", {
      address,
      currency: this.currency,
    })

    // Status 200 = valid address, 456 = address not found on FaucetPay
    if (response.status !== 200) {
      const errorMessage = FAUCETPAY_ERROR_MESSAGES[response.status] || response.message || "Address verification failed"
      throw new FaucetPayError(errorMessage, response.status)
    }

    return response
  }

  async sendPayment(to: string, amount: number, ipAddress: string, referral = false): Promise<FaucetPayResponse> {
    log.info("FaucetPay payment initiated", { to: to.substring(0, 5) + "...", amount, currency: this.currency, referral })

    const response = await this.request<FaucetPayResponse>("/send", {
      to,
      amount,
      currency: this.currency,
      ip_address: ipAddress,
      referral: referral ? "true" : "false",
    })

    // FaucetPay API status codes:
    // 200 = Success
    // 400 = Invalid API key / General error  
    // 401 = Invalid API key
    // 402 = Insufficient funds
    // 403 = Disabled payouts / IP banned
    // 405 = Too many requests (rate limited)
    // 450 = Invalid currency
    // 456 = Invalid to address (email not registered on FaucetPay)
    // 457 = Payout amount too small
    // 458 = Daily limit reached
    // 459 = Referral payout limit reached
    // 460 = User suspended
    // 461 = Wrong currency for this user

    if (response.status !== 200) {
      const errorMessage = FAUCETPAY_ERROR_MESSAGES[response.status] || response.message || "Payment failed"
      log.error("FaucetPay payment failed", {
        status: response.status,
        message: response.message,
        to: to.substring(0, 5) + "...",
        amount,
        currency: this.currency
      })
      throw new FaucetPayError(errorMessage, response.status)
    }

    log.info("FaucetPay payment successful", {
      payoutId: response.payout_id,
      amount,
      balance: response.balance,
    })

    return response
  }

  async getBalance(): Promise<BalanceResponse> {
    const response = await this.request<BalanceResponse>("/balance", {
      currency: this.currency,
    })

    if (response.status !== 200) {
      throw new FaucetPayError(response.message || "Failed to get balance", response.status)
    }

    return response
  }

  async getPayouts(count = 10): Promise<unknown> {
    return this.request("/payouts", { count })
  }

  // Set currency dynamically
  setCurrency(currency: string): void {
    if (!FAUCETPAY_SUPPORTED_CURRENCIES.includes(currency)) {
      throw new Error(`Currency ${currency} is not supported by FaucetPay`)
    }
    this.currency = currency
  }
}

// Singleton instance per currency
const faucetPayClients: Map<string, FaucetPayClient> = new Map()

export function getFaucetPayClient(currency = "BTC"): FaucetPayClient {
  // Note: use resolveFaucetPayApiKey() from API routes for DB-first lookup
  const apiKey = process.env.FAUCETPAY_API_KEY
  if (!apiKey) {
    throw new FaucetPayError("FaucetPay API key not configured. Set it in Admin → Settings → FaucetPay.", 500)
  }

  // Validate currency
  if (!FAUCETPAY_SUPPORTED_CURRENCIES.includes(currency)) {
    throw new FaucetPayError(`Currency ${currency} is not supported by FaucetPay`, 450)
  }

  // Get or create client for this currency
  let client = faucetPayClients.get(currency)
  if (!client) {
    client = new FaucetPayClient({ apiKey, currency })
    faucetPayClients.set(currency, client)
  }

  return client
}

// Check if FaucetPay is configured
// Check if FaucetPay is configured (env var only — DB check requires async)
export function isFaucetPayConfigured(): boolean {
  return !!process.env.FAUCETPAY_API_KEY
}

// Async version that checks DB first — use this in API routes
export async function resolveFaucetPayApiKey(
  supabase?: { from: (table: string) => any }
): Promise<string | null> {
  if (supabase) {
    try {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "faucetpay_api_key")
        .single()
      const dbKey = (data?.value as string | null)?.trim()
      if (dbKey) return dbKey
    } catch { /* fall through */ }
  }
  return process.env.FAUCETPAY_API_KEY?.trim() || null
}

// Verify a FaucetPay email is valid and registered
// This is a "soft" verification - we allow saving even if verification fails
// The actual payment will fail if the email is invalid, which is a better UX
export async function verifyFaucetPayEmail(email: string, currency = "BTC"): Promise<{ valid: boolean; error?: string }> {
  // First validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email.trim())) {
    return { valid: false, error: "Invalid email format" }
  }

  // If FaucetPay API is not configured, assume valid (for development)
  if (!isFaucetPayConfigured()) {
    return { valid: true }
  }

  try {
    const client = getFaucetPayClient(currency)
    await client.checkAddress(email.trim())
    return { valid: true }
  } catch (error) {
    if (error instanceof FaucetPayError) {
      // Return specific error for user-fixable issues
      return { valid: false, error: error.message }
    }
    // Network errors etc - don't block the user
    log.warn("FaucetPay verification error (non-blocking)", { email: email.substring(0, 5) + "***", error })
    return { valid: false, error: "Verification service temporarily unavailable" }
  }
}
