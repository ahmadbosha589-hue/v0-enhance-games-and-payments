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

export class FaucetPayClient {
  private apiKey: string
  private baseUrl = "https://faucetpay.io/api/v1"
  private currency: string

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

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      throw new Error(`FaucetPay API error: ${response.status}`)
    }

    return response.json() as Promise<T>
  }

  async checkAddress(address: string): Promise<CheckAddressResponse> {
    return this.request<CheckAddressResponse>("/checkaddress", {
      address,
      currency: this.currency,
    })
  }

  async sendPayment(to: string, amount: number, ipAddress: string, referral = false): Promise<FaucetPayResponse> {
    log.info("FaucetPay payment initiated", { to, amount, referral })

    const response = await this.request<FaucetPayResponse>("/send", {
      to,
      amount,
      currency: this.currency,
      ip_address: ipAddress,
      referral: referral ? "true" : "false",
    })

    if (response.status !== 200) {
      log.error("FaucetPay payment failed", { response })
      throw new Error(response.message || "Payment failed")
    }

    log.info("FaucetPay payment successful", {
      payoutId: response.payout_id,
      amount,
    })

    return response
  }

  async getBalance(): Promise<BalanceResponse> {
    return this.request<BalanceResponse>("/balance", {
      currency: this.currency,
    })
  }

  async getPayouts(count = 10): Promise<unknown> {
    return this.request("/payouts", { count })
  }
}

// Singleton instance
let faucetPayClient: FaucetPayClient | null = null

export function getFaucetPayClient(): FaucetPayClient {
  if (!faucetPayClient) {
    const apiKey = process.env.FAUCETPAY_API_KEY
    if (!apiKey) {
      throw new Error("FAUCETPAY_API_KEY not configured")
    }
    faucetPayClient = new FaucetPayClient({ apiKey })
  }
  return faucetPayClient
}
