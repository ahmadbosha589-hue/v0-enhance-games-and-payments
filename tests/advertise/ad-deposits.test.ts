import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8")

describe("advertise deposits & cashout (contract)", () => {
  it("cashout debits ad balance atomically before paying and refunds on failure", () => {
    const src = read("app/api/advertise/cashout/route.ts")
    expect(src).toContain('rpc("debit_ad_balance"')
    expect(src).toContain("credit_ad_balance") // refund path
    expect(src).toContain("sendFaucetPayPayment")
    // debit happens BEFORE the payment call (fail-safe ordering)
    const debitIdx = src.indexOf("debit_ad_balance")
    const payIdx = src.indexOf("sendFaucetPayPayment(")
    expect(debitIdx).toBeLessThan(payIdx)
  })

  it("migration 109 provides atomic ad-balance debit/credit + earnings transfer", () => {
    const sql = read("scripts/109_ad_balance_cashout.sql")
    for (const fn of ["debit_ad_balance", "credit_ad_balance", "transfer_earnings_to_ad_balance"]) {
      expect(sql).toContain(fn)
    }
    expect(sql).toContain("FOR UPDATE")
    expect(sql).toContain("TO service_role")
  })

  it("faucetpay balance deposit uses live rate and atomic transfer RPC", () => {
    const src = read("app/api/advertise/deposit-faucetpay/route.ts")
    expect(src).toContain("usdToSatoshis")
    expect(src).toContain("RATE_UNAVAILABLE")
    expect(src).toContain("transfer_earnings_to_ad_balance")
    expect(src).toContain("p_price_satoshis: satoshisToCharge")
  })

  it("advertise page offers FaucetPay balance deposit alongside CCPayment", () => {
    const src = read("app/dashboard/advertise/page.tsx")
    expect(src).toContain("deposit-faucetpay")
    expect(src).toContain("Or pay from your site balance")
    expect(src).toContain("handleFaucetPayDeposit")
    expect(src).toContain("/api/advertise/cashout")
  })

  it("shared FaucetPay helper maps provider errors consistently", () => {
    const src = read("lib/payments/faucetpay.ts")
    expect(src).toContain("FAUCETPAY_API_URL")
    expect(src).toContain("457: ")  // min-amount error mapped
    expect(src).toContain("getFaucetPayApiKey")
  })
})
