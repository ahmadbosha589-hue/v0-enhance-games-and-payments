import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const route = readFileSync(resolve(process.cwd(), "app/api/ccpayment/withdraw/route.ts"), "utf8")

describe("CCPayment withdrawal pricing contract", () => {
  it("does not use a synthetic fixed satoshi conversion", () => {
    expect(route).not.toContain("SATOSHI_TO_USD")
    expect(route).toContain("getCoinUSDTPrices")
    expect(route).toContain("getBTCPrice")
  })
})
