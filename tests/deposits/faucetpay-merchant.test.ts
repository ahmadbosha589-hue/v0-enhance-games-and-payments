import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8")

describe("FaucetPay account deposits (Merchant API)", () => {
  it("create route fails closed without FAUCETPAY_MERCHANT_USERNAME and signs sessions", () => {
    const src = read("app/api/deposit/faucetpay/route.ts")
    expect(src).toContain("FAUCETPAY_MERCHANT_USERNAME")
    expect(src).toContain("FAUCETPAY_DEPOSITS_DISABLED")
    expect(src).toContain("faucetpay.io/merchant/webscr")
    expect(src).toContain("createHmac")
    expect(src).toContain("callback_url")
    // pending deposit recorded before redirect
    expect(src).toContain('status: "pending"')
  })

  it("IPN callback verifies server-to-server via get-payment and never trusts POST body", () => {
    const src = read("app/api/deposit/faucetpay/callback/route.ts")
    expect(src).toContain("faucetpay.io/merchant/get-payment")
    expect(src).toContain("valid")
    // merchant + amount checks against the VERIFIED data
    expect(src).toContain("merchant mismatch")
    expect(src).toContain("amount mismatch")
    // idempotent credit through audited RPC
    expect(src).toContain("safe_add_balance")
    expect(src).toContain("idempotencyKey")
    // live-rate conversion; retries (503) when rate unavailable rather than guessing
    expect(src).toContain("usdToSatoshis")
    expect(src).toContain("retry later")
  })

  it("withdrawals page exposes the FaucetPay deposit card", () => {
    const src = read("app/dashboard/withdrawals/page.tsx")
    expect(src).toContain("FaucetPayDeposit")
  })

  it("deposit UI redirects to FaucetPay merchant checkout", () => {
    const src = read("components/dashboard/faucetpay-deposit.tsx")
    expect(src).toContain("/api/deposit/faucetpay")
    expect(src).toContain("window.location.href = data.merchantUrl")
  })
})
