import crypto from "crypto"
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/rate-limiter"

const CCPAYMENT_API_URL = "https://ccpayment.com/ccpayment/v2"
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000
const REQUEST_TIMEOUT_MS = 30000
const DEFAULT_USD_FIAT_ID = 1033
const CCPAYMENT_USER_AGENT = "Faucero-CCPayment/1.0"

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
  closeUrl?: string
  validTimestamp?: number
  productName?: string
  orderValidPeriod?: number
  buyerEmail?: string
  /** Retained for caller compatibility; v2 stores merchant metadata in the order ID. */
  customValue?: string
}

interface NativeOrderParams extends CreateOrderParams {
  coinId: string
  chain: string
}

interface WithdrawParams {
  coinId: string
  address: string
  chain: string
  amount: string
  merchantOrderId: string
  memo?: string
  notifyUrl?: string
}

interface SwapParams {
  coinFrom: string
  coinTo: string
  amount: string
  merchantOrderId: string
  amountOutMinimum?: string
}

export interface CCPaymentCoin {
  coinId: string | number
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
  payAddress?: string
  paymentAmount?: string
  currency?: string
  status?: string | number
  expiresAt: number
  qrCodeUrl?: string
  invoiceUrl?: string
  paymentUrl?: string
  checkoutUrl?: string
  confirmsNeeded?: number
}

export interface CCPaymentInvoiceOrder {
  orderId: string
  createAt?: number
  product?: string
  price?: string
  priceCoinId?: number
  priceFiatId?: number
  priceSymbol?: string
  invoiceUrl?: string
  expiredAt?: number
  totalPaidValue?: string
  paidList: Array<{
    recordId?: string
    coinId?: number
    coinSymbol?: string
    chain?: string
    fromAddress?: string
    toAddress?: string
    toMemo?: string
    paidAmount?: string
    amount?: string
    serviceFee?: string
    rate?: string
    paidValue?: string
    txid?: string
    status?: string
    arrivedAt?: number
    isFlaggedAsRisky?: boolean
  }>
}

export interface CCPaymentWithdrawal {
  orderId: string
  merchantOrderId: string
  status: string
  txHash?: string
  fee: string
  recordId?: string
}

export interface SwapQuote {
  fromCoinId: string
  toCoinId: string
  fromAmount: string
  toAmount: string
  rate: string
  fee: string
  validUntil: number
  amountOutMinimum?: string
}

export interface CCPaymentSwapRecord {
  orderId: string
  recordId?: string
  status: string
  fromCoinId: string
  toCoinId: string
  fromAmount: string
  toAmount: string
  rate?: string
  fee?: string
  txHash?: string
}

interface ApiEnvelope<T> {
  code: number | string
  msg?: string
  data?: T
}

function asFiniteNumber(value: unknown, field: string): number {
  const result = Number(value)
  if (!Number.isFinite(result)) {
    throw new Error(`CCPayment returned an invalid ${field}`)
  }
  return result
}

function asPositiveInteger(value: string | number, field: string): number {
  const result = Number(value)
  if (!Number.isInteger(result) || result <= 0) {
    throw new Error(`CCPayment requires a numeric ${field}`)
  }
  return result
}

function resolveFiatId(currency: string): number {
  const normalized = currency.trim().toUpperCase()
  const configured = normalized === "USD"
    ? process.env.CCPAYMENT_USD_FIAT_ID || process.env.CCPAYMENT_FIAT_ID
    : process.env[`CCPAYMENT_${normalized}_FIAT_ID`]

  const fiatId = Number(configured || (normalized === "USD" ? DEFAULT_USD_FIAT_ID : NaN))
  if (!Number.isInteger(fiatId) || fiatId <= 0) {
    throw new Error(`CCPayment fiat ID is not configured for ${normalized}`)
  }
  return fiatId
}

function expiryTimestamp(validTimestamp?: number, orderValidPeriod = 3600): number {
  const candidate = validTimestamp || Math.floor(Date.now() / 1000) + orderValidPeriod
  if (!Number.isInteger(candidate) || candidate <= Math.floor(Date.now() / 1000)) {
    throw new Error("CCPayment order expiration must be a future Unix timestamp")
  }
  return candidate
}

class CCPaymentClient {
  private appId: string
  private appSecret: string

  constructor(config: CCPaymentConfig) {
    this.appId = config.appId
    this.appSecret = config.appSecret
  }

  private generateSignature(timestamp: string, body = ""): string {
    const signText = `${this.appId}${timestamp}${body}`
    return crypto.createHmac("sha256", this.appSecret).update(signText).digest("hex")
  }

  private async request<T>(endpoint: string, method: "POST" = "POST", body?: Record<string, unknown>): Promise<T> {
    const rateLimitResult = await checkRateLimit(`ccpayment:${this.appId}`, RATE_LIMITS.api)
    if (!rateLimitResult.allowed) {
      throw new Error("Rate limit exceeded. Please try again in a moment.")
    }

    const bodyStr = body && Object.keys(body).length > 0 ? JSON.stringify(body) : ""
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const signature = this.generateSignature(timestamp, bodyStr)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      try {
        const response = await fetch(`${CCPAYMENT_API_URL}${endpoint}`, {
          method,
          headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Accept": "application/json",
            "User-Agent": CCPAYMENT_USER_AGENT,
            "Appid": this.appId,
            "Timestamp": timestamp,
            "Sign": signature,
          },
          body: bodyStr || undefined,
          signal: controller.signal,
        })

        const responseText = await response.text()
        let envelope: ApiEnvelope<T>
        try {
          envelope = JSON.parse(responseText) as ApiEnvelope<T>
        } catch {
          throw new Error(`CCPayment returned a non-JSON response (HTTP ${response.status})`)
        }

        if (!response.ok) {
          throw new Error(envelope.msg || `CCPayment HTTP error (${response.status})`)
        }

        const code = Number(envelope.code)
        if (code !== 10000) {
          const errorMessage = ERROR_MESSAGES[code] || envelope.msg || `CCPayment error (code: ${envelope.code})`
          const error = new Error(errorMessage) as Error & { code?: number }
          error.code = code
          throw error
        }

        return (envelope.data ?? {}) as T
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown CCPayment error")
        const lower = lastError.message.toLowerCase()
        if (lower.includes("invalid") || lower.includes("insufficient") || lower.includes("rate limit") || lower.includes("requires a numeric")) {
          throw lastError
        }
        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt))
        }
      } finally {
        clearTimeout(timeoutId)
      }
    }

    throw lastError || new Error("CCPayment API request failed after retries")
  }

  async getSupportedCoins(): Promise<CCPaymentCoin[]> {
    const data = await this.request<{ coins?: Array<Record<string, unknown>> | CCPaymentCoin[] }>("/getCoinList")
    const coins = Array.isArray(data) ? data : data.coins || []
    return coins.map((coin: any) => ({
      coinId: coin.coinId,
      symbol: coin.symbol,
      name: coin.coinFullName || coin.name || coin.symbol,
      logoUrl: coin.logoUrl || "",
      price: coin.price || "",
      chains: Object.entries(coin.networks || {}).map(([chainId, network]: [string, any]) => ({
        chainId,
        chainName: network?.chainFullName || chainId,
        minWithdrawAmount: network?.minWithdrawAmount || "",
        withdrawFee: network?.withdrawFee || "",
      })),
    }))
  }

  async getCoinInfo(coinId: string): Promise<CCPaymentCoin> {
    const data = await this.request<{ coin?: any }>("/getCoin", "POST", { coinId: asPositiveInteger(coinId, "coin ID") })
    const coin = data.coin || data
    return {
      coinId: coin.coinId,
      symbol: coin.symbol,
      name: coin.coinFullName || coin.name || coin.symbol,
      logoUrl: coin.logoUrl || "",
      price: coin.price || "",
      chains: Object.entries(coin.networks || {}).map(([chainId, network]: [string, any]) => ({
        chainId,
        chainName: network?.chainFullName || chainId,
        minWithdrawAmount: network?.minWithdrawAmount || "",
        withdrawFee: network?.withdrawFee || "",
      })),
    }
  }

  async getCoinUSDTPrices(coinIds: string[]): Promise<Record<string, string>> {
    const data = await this.request<{ prices?: Record<string, string> }>("/getCoinUSDTPrice", "POST", {
      coinIds: coinIds.map((coinId) => asPositiveInteger(coinId, "coin ID")),
    })
    return Object.fromEntries(Object.entries(data.prices || {}).map(([coinId, price]) => [String(coinId), String(price)]))
  }

  async createOrder(params: CreateOrderParams): Promise<CCPaymentOrder> {
    const expiresAt = expiryTimestamp(params.validTimestamp, params.orderValidPeriod)
    const data = await this.request<{ invoiceUrl?: string }>("/createInvoiceUrl", "POST", {
      orderId: params.merchantOrderId,
      price: params.productPrice,
      priceFiatId: resolveFiatId(params.currency),
      product: params.productName || "Deposit",
      returnUrl: params.returnUrl,
      closeUrl: params.closeUrl,
      notifyUrl: params.notifyUrl,
      buyerEmail: params.buyerEmail,
      expiredAt: expiresAt,
    })

    if (!data.invoiceUrl) {
      throw new Error("CCPayment did not return an invoice URL")
    }

    return {
      orderId: params.merchantOrderId,
      merchantOrderId: params.merchantOrderId,
      invoiceUrl: data.invoiceUrl,
      paymentUrl: data.invoiceUrl,
      checkoutUrl: data.invoiceUrl,
      paymentAmount: params.productPrice,
      currency: params.currency,
      status: "pending",
      expiresAt,
    }
  }

  async createNativeOrder(params: NativeOrderParams): Promise<CCPaymentOrder> {
    const expiresAt = expiryTimestamp(params.validTimestamp, params.orderValidPeriod)
    const data = await this.request<{
      address?: string
      amount?: string
      memo?: string
      checkoutUrl?: string
      confirmsNeeded?: number
    }>("/createAppOrderDepositAddress", "POST", {
      orderId: params.merchantOrderId,
      coinId: asPositiveInteger(params.coinId, "coin ID"),
      fiatId: resolveFiatId(params.currency),
      price: params.productPrice,
      chain: params.chain,
      expiredAt: expiresAt,
      generateCheckoutURL: true,
      product: params.productName || "Deposit",
      returnUrl: params.returnUrl,
      closeUrl: params.closeUrl,
      notifyUrl: params.notifyUrl,
      buyerEmail: params.buyerEmail,
    })

    return {
      orderId: params.merchantOrderId,
      merchantOrderId: params.merchantOrderId,
      payAddress: data.address,
      paymentAmount: data.amount,
      currency: params.currency,
      status: "pending",
      expiresAt,
      checkoutUrl: data.checkoutUrl,
      paymentUrl: data.checkoutUrl,
      invoiceUrl: data.checkoutUrl,
      confirmsNeeded: data.confirmsNeeded,
    }
  }

  async getInvoiceOrderInfo(orderId: string): Promise<CCPaymentInvoiceOrder> {
    return this.request<CCPaymentInvoiceOrder>("/getInvoiceOrderInfo", "POST", { orderId })
  }

  async getAppOrderInfo(orderId: string): Promise<CCPaymentInvoiceOrder> {
    return this.request<CCPaymentInvoiceOrder>("/getAppOrderInfo", "POST", { orderId })
  }

  async getOrderStatus(orderId: string): Promise<CCPaymentInvoiceOrder> {
    return this.getInvoiceOrderInfo(orderId)
  }

  async withdraw(params: WithdrawParams): Promise<CCPaymentWithdrawal> {
    const data = await this.request<{ recordId?: string }>("/applyAppWithdrawToNetwork", "POST", {
      orderId: params.merchantOrderId,
      coinId: asPositiveInteger(params.coinId, "coin ID"),
      chain: params.chain,
      address: params.address,
      amount: params.amount,
      memo: params.memo,
      notifyUrl: params.notifyUrl,
    })

    return {
      orderId: data.recordId || params.merchantOrderId,
      recordId: data.recordId,
      merchantOrderId: params.merchantOrderId,
      status: "pending",
      fee: "",
    }
  }

  async getWithdrawalStatus(orderId: string): Promise<CCPaymentWithdrawal> {
    const data = await this.request<{ record?: any }>("/getAppWithdrawRecord", "POST", { recordId: orderId })
    const record = data.record || data
    return {
      orderId: record.orderId || orderId,
      recordId: record.recordId,
      merchantOrderId: record.orderId || orderId,
      status: record.status || "pending",
      txHash: record.txId,
      fee: record.fee?.amount || "",
    }
  }

  async getBalance(coinId?: string): Promise<Array<{ coinId: string; available: string; frozen: string }>> {
    const data = await this.request<{ assets?: any[] }>("/getAppCoinAssetList")
    const assets = data.assets || (Array.isArray(data) ? data : [])
    return assets
      .filter((asset: any) => !coinId || String(asset.coinId) === String(coinId))
      .map((asset: any) => ({
        coinId: String(asset.coinId),
        available: String(asset.available || "0"),
        frozen: String(asset.frozen || "0"),
      }))
  }

  async getSwapQuote(fromCoinId: string, toCoinId: string, amount: string): Promise<SwapQuote> {
    const data = await this.request<any>("/estimate", "POST", {
      coinIdIn: asPositiveInteger(fromCoinId, "input coin ID"),
      amountIn: amount,
      coinIdOut: asPositiveInteger(toCoinId, "output coin ID"),
    })
    const quote = data.quote || data
    return {
      fromCoinId: String(quote.coinIdIn ?? fromCoinId),
      toCoinId: String(quote.coinIdOut ?? toCoinId),
      fromAmount: String(quote.amountIn ?? amount),
      toAmount: String(quote.netAmountOut ?? quote.amountOut ?? "0"),
      rate: String(quote.swapRate || "0"),
      fee: String(quote.fee || "0"),
      validUntil: Date.now() + 5 * 60 * 1000,
      amountOutMinimum: String(quote.netAmountOut ?? quote.amountOut ?? "0"),
    }
  }

  async executeSwap(params: SwapParams): Promise<CCPaymentSwapRecord> {
    const data = await this.request<any>("/swap", "POST", {
      orderId: params.merchantOrderId,
      coinIdIn: asPositiveInteger(params.coinFrom, "input coin ID"),
      amountIn: params.amount,
      coinIdOut: asPositiveInteger(params.coinTo, "output coin ID"),
      amountOutMinimum: params.amountOutMinimum,
    })
    const swap = data.swap || data
    return {
      orderId: swap.orderId || swap.recordId || params.merchantOrderId,
      recordId: swap.recordId,
      status: swap.status || "processing",
      fromCoinId: String(swap.coinIdIn ?? params.coinFrom),
      toCoinId: String(swap.coinIdOut ?? params.coinTo),
      fromAmount: String(swap.amountIn ?? params.amount),
      toAmount: String(swap.netAmountOut ?? swap.amountOut ?? "0"),
      rate: swap.swapRate,
      fee: swap.fee,
    }
  }

  async getSwapStatus(orderId: string): Promise<CCPaymentSwapRecord> {
    const data = await this.request<{ record?: any }>("/getSwapRecord", "POST", { orderId })
    const record = data.record || data
    return {
      orderId: record.orderId || orderId,
      recordId: record.recordId,
      status: record.status || "processing",
      fromCoinId: String(record.coinIdIn || ""),
      toCoinId: String(record.coinIdOut || ""),
      fromAmount: String(record.amountIn || "0"),
      toAmount: String(record.netAmountOut || record.amountOut || "0"),
      rate: record.swapRate,
      fee: record.fee,
    }
  }

  verifyWebhook(signature: string, timestamp: string, body: string): boolean {
    if (!signature || !/^\d{10}$/.test(timestamp)) return false
    const expected = this.generateSignature(timestamp, body)
    const receivedBuffer = Buffer.from(signature.trim().toLowerCase(), "utf8")
    const expectedBuffer = Buffer.from(expected, "utf8")
    return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  }
}

export function isCCPaymentTimestampFresh(timestamp: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const parsed = Number(timestamp)
  return /^\d{10}$/.test(timestamp) && Math.abs(nowSeconds - parsed) <= 120
}

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

let btcPriceCache: { price: number; timestamp: number } | null = null
const PRICE_CACHE_DURATION_MS = 60000

export async function getBTCPrice(): Promise<number> {
  const now = Date.now()

  if (btcPriceCache && now - btcPriceCache.timestamp < PRICE_CACHE_DURATION_MS) {
    return btcPriceCache.price
  }

  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { next: { revalidate: 60 } },
    )

    if (!response.ok) throw new Error("Failed to fetch BTC price")

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

export async function satoshisToUSD(satoshis: number): Promise<number> {
  const btcPrice = await getBTCPrice()
  return (satoshis / 100000000) * btcPrice
}

export async function usdToSatoshis(usd: number): Promise<number> {
  const btcPrice = await getBTCPrice()
  return Math.floor((usd / btcPrice) * 100000000)
}

export { CCPaymentClient }
