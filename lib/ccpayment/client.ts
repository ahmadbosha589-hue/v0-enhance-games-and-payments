import crypto from "crypto"
import { checkRateLimit, checkRateLimitSync, RATE_LIMITS } from "@/lib/api/rate-limiter"

const CCPAYMENT_API_URL = "https://admin.ccpayment.com/ccpayment/v1"
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000
const REQUEST_TIMEOUT_MS = 30000

// Error codes for better user messaging
const ERROR_MESSAGES: Record<number, string> = {
  10001: "Invalid API credentials. Please check your CCPayment configuration.",
  10002: "Invalid request signature. Please try again.",
  10003: "Request has expired. Please refresh and try again.",
  10004: "Insufficient balance in your CCPayment account.",
  10005: "Selected cryptocurrency or network is not supported.",
  10006: "Invalid wallet address. Please check and try again.",
  10007: "Amount is below the minimum withdrawal limit.",
  10008: "Daily withdrawal limit exceeded. Please try again tomorrow.",
  10009: "Account verification required for this operation.",
  10010: "This operation is temporarily unavailable. Please try later.",
}

interface CCPaymentConfig {
  appId: string
  appSecret: string
}

interface CreateOrderParams {
  productPrice: string
  currency: string
  merchantOrderId: string
  denominated?: string
  notifyUrl?: string
  returnUrl?: string
  validTimestamp?: number
  productName?: string
  orderValidPeriod?: number
  customValue?: string
}

interface WithdrawParams {
  coinId: string
  address: string
  chain: string
  amount: string
  merchantOrderId: string
  memo?: string
}

interface SwapParams {
  coinFrom: string
  coinTo: string
  amount: string
  merchantOrderId: string
}

export interface CCPaymentCoin {
  coinId: string
  symbol: string
  name: string
  logoUrl: string
  chains: Array<{
    chainId: string
    chainName: string
    minWithdrawAmount: string
    withdrawFee: string
  }>
  price: string
}

export interface CCPaymentOrder {
  orderId: string
  merchantOrderId: string
  payAddress: string
  paymentAmount: string
  currency: string
  status: number
  expiresAt: number
  qrCodeUrl?: string
}

export interface CCPaymentWithdrawal {
  orderId: string
  merchantOrderId: string
  status: number
  txHash?: string
  fee: string
}

export interface SwapQuote {
  fromCoinId: string
  toCoinId: string
  fromAmount: string
  toAmount: string
  rate: string
  fee: string
  validUntil: number
}

class CCPaymentClient {
  private appId: string
  private appSecret: string

  constructor(config: CCPaymentConfig) {
    this.appId = config.appId
    this.appSecret = config.appSecret
  }

  private generateSignature(timestamp: string, body: string = ""): string {
    const signStr = `${this.appId}${this.appSecret}${timestamp}${body}`
    return crypto.createHash("sha256").update(signStr).digest("hex")
  }

  private async request<T>(endpoint: string, method: "GET" | "POST" = "POST", body?: Record<string, unknown>): Promise<T> {
    // Check rate limit (Redis-backed for distributed consistency)
    const rateLimitResult = await checkRateLimit(`ccpayment:${this.appId}`, RATE_LIMITS.api)
    if (!rateLimitResult.allowed) {
      throw new Error("Rate limit exceeded. Please try again in a moment.")
    }

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const timestamp = Math.floor(Date.now() / 1000).toString()
        const bodyStr = body ? JSON.stringify(body) : ""
        const signature = this.generateSignature(timestamp, bodyStr)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

        const response = await fetch(`${CCPAYMENT_API_URL}${endpoint}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            "Appid": this.appId,
            "Timestamp": timestamp,
            "Sign": signature
          },
          body: method === "POST" ? bodyStr : undefined,
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        const data = await response.json()

        // Handle error codes with user-friendly messages
        if (data.code !== 10000) {
          const errorMessage = ERROR_MESSAGES[data.code] || data.msg || `CCPayment error (code: ${data.code})`
          const error = new Error(errorMessage)
            // Add error code for debugging
            ; (error as Error & { code?: number }).code = data.code
          throw error
        }

        return data.data as T
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error")

        // Don't retry on certain errors
        if (lastError.message.includes("Invalid") ||
          lastError.message.includes("Insufficient") ||
          lastError.message.includes("Rate limit")) {
          throw lastError
        }

        // Wait before retrying
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt))
        }
      }
    }

    throw lastError || new Error("CCPayment API request failed after retries")
  }

  // Get supported cryptocurrencies
  async getSupportedCoins(): Promise<CCPaymentCoin[]> {
    return this.request<CCPaymentCoin[]>("/coin/all")
  }

  // Get specific coin info
  async getCoinInfo(coinId: string): Promise<CCPaymentCoin> {
    return this.request<CCPaymentCoin>("/coin/info", "POST", { coinId })
  }

  // Create a deposit order (hosted checkout)
  async createOrder(params: CreateOrderParams): Promise<CCPaymentOrder> {
    return this.request<CCPaymentOrder>("/concise/url/get", "POST", {
      product_price: params.productPrice,
      currency: params.currency,
      merchant_order_id: params.merchantOrderId,
      denominated: params.denominated || "USDT",
      notify_url: params.notifyUrl,
      return_url: params.returnUrl,
      valid_timestamp: params.validTimestamp || Math.floor(Date.now() / 1000) + 3600,
      product_name: params.productName || "Deposit",
      order_valid_period: params.orderValidPeriod || 3600,
      custom_value: params.customValue
    })
  }

  // Create native checkout order
  async createNativeOrder(params: CreateOrderParams & { coinId: string; chain: string }): Promise<CCPaymentOrder> {
    return this.request<CCPaymentOrder>("/bill/create", "POST", {
      coin_id: params.coinId,
      chain: params.chain,
      product_price: params.productPrice,
      merchant_order_id: params.merchantOrderId,
      notify_url: params.notifyUrl,
      return_url: params.returnUrl,
      order_valid_period: params.orderValidPeriod || 3600
    })
  }

  // Get order status
  async getOrderStatus(orderId: string): Promise<CCPaymentOrder> {
    return this.request<CCPaymentOrder>("/bill/info", "POST", { order_id: orderId })
  }

  // Withdraw to external wallet
  async withdraw(params: WithdrawParams): Promise<CCPaymentWithdrawal> {
    return this.request<CCPaymentWithdrawal>("/withdraw", "POST", {
      coin_id: params.coinId,
      address: params.address,
      chain: params.chain,
      amount: params.amount,
      merchant_order_id: params.merchantOrderId,
      memo: params.memo
    })
  }

  // Get withdrawal status
  async getWithdrawalStatus(orderId: string): Promise<CCPaymentWithdrawal> {
    return this.request<CCPaymentWithdrawal>("/withdraw/info", "POST", { order_id: orderId })
  }

  // Get balance
  async getBalance(coinId?: string): Promise<Array<{ coinId: string; available: string; frozen: string }>> {
    const body = coinId ? { coin_id: coinId } : undefined
    return this.request<Array<{ coinId: string; available: string; frozen: string }>>("/assets", "POST", body)
  }

  // Get swap quote
  async getSwapQuote(fromCoinId: string, toCoinId: string, amount: string): Promise<SwapQuote> {
    return this.request<SwapQuote>("/swap/quote", "POST", {
      coin_from: fromCoinId,
      coin_to: toCoinId,
      amount
    })
  }

  // Execute swap
  async executeSwap(params: SwapParams): Promise<{ orderId: string; status: string }> {
    return this.request<{ orderId: string; status: string }>("/swap/execute", "POST", {
      coin_from: params.coinFrom,
      coin_to: params.coinTo,
      amount: params.amount,
      merchant_order_id: params.merchantOrderId
    })
  }

  // Get swap status
  async getSwapStatus(orderId: string): Promise<{ orderId: string; status: string; txHash?: string }> {
    return this.request<{ orderId: string; status: string; txHash?: string }>("/swap/info", "POST", { order_id: orderId })
  }

  // Verify webhook signature
  verifyWebhook(signature: string, timestamp: string, body: string): boolean {
    const expectedSignature = this.generateSignature(timestamp, body)
    return signature === expectedSignature
  }
}

// Singleton instance
let client: CCPaymentClient | null = null

export function getCCPaymentClient(): CCPaymentClient {
  if (!client) {
    const appId = process.env.CCPAYMENT_APP_ID
    const appSecret = process.env.CCPAYMENT_APP_SECRET

    if (!appId || !appSecret) {
      throw new Error("CCPayment credentials not configured. Please set CCPAYMENT_APP_ID and CCPAYMENT_APP_SECRET environment variables.")
    }

    client = new CCPaymentClient({ appId, appSecret })
  }

  return client
}

// Cache for BTC price
let btcPriceCache: { price: number; timestamp: number } | null = null
const PRICE_CACHE_DURATION_MS = 60000 // 1 minute

// Get current BTC price in USD (cached)
export async function getBTCPrice(): Promise<number> {
  const now = Date.now()

  if (btcPriceCache && now - btcPriceCache.timestamp < PRICE_CACHE_DURATION_MS) {
    return btcPriceCache.price
  }

  try {
    // Use CoinGecko free API for price
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { next: { revalidate: 60 } }
    )

    if (!response.ok) {
      throw new Error("Failed to fetch BTC price")
    }

    const data = await response.json()
    const price = Number(data.bitcoin?.usd)
    if (!Number.isFinite(price) || price <= 0) throw new Error("BTC price response was invalid")

    btcPriceCache = { price, timestamp: now }
    return price
  } catch (error) {
    if (btcPriceCache) return btcPriceCache.price
    throw error instanceof Error ? error : new Error("BTC price unavailable")
  }
}

// Convert satoshis to USD
export async function satoshisToUSD(satoshis: number): Promise<number> {
  const btcPrice = await getBTCPrice()
  return (satoshis / 100000000) * btcPrice
}

// Convert USD to satoshis
export async function usdToSatoshis(usd: number): Promise<number> {
  const btcPrice = await getBTCPrice()
  return Math.floor((usd / btcPrice) * 100000000)
}

export { CCPaymentClient }
