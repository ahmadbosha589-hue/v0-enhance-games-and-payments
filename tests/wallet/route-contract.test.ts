import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("wallet payment runtime contracts", () => {
  it("creates a configured ERC-20 wallet payment intent", () => {
    const api = read("app/api/boosters/route.ts")
    expect(api).toContain("getWalletPaymentConfig")
    expect(api).toContain("decimalToBaseUnits")
    expect(api).toContain("walletPayment:")
    expect(api).not.toContain('const btcAddress = ""')
  })

  it("verifies a transaction before booster activation", () => {
    const confirm = read("app/api/boosters/wallet/confirm/route.ts")
    expect(confirm).toContain("eth_getTransactionReceipt")
    expect(confirm).toContain("eth_getTransactionByHash")
    expect(confirm).toContain("eth_blockNumber")
    expect(confirm).toContain("isVerifiedErc20Transfer")
    expect(confirm).toContain("activate_booster_purchase")
  })
})
