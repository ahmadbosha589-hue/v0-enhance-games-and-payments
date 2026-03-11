import crypto from "crypto"

const CCPAYMENT_API_URL = "https://admin.ccpayment.com/ccpayment/v1"

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
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const bodyStr = body ? JSON.stringify(body) : ""
    const signature = this.generateSignature(timestamp, bodyStr)

    const response = await fetch(`${CCPAYMENT_API_URL}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Appid": this.appId,
        "Timestamp": timestamp,
        "Sign": signature
      },
      body: method === "POST" ? bodyStr : undefined
    })

    const data = await response.json()

    if (data.code !== 10000) {
      throw new Error(data.msg || "CCPayment API error")
    }

    return data.data as T
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

export { CCPaymentClient }
