import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n")

describe("booster purchase runtime contracts", () => {
  it("uses the real profile endpoint and keeps pending payment state visible", () => {
    const component = read("components/boosters/boosters-content.tsx")
    const api = read("app/api/boosters/route.ts")

    expect(component).toContain("/api/profile")
    expect(component).not.toContain("/api/user/profile")
    const handler = component.slice(component.indexOf("const handleConfirmPurchase"))
    expect(handler).not.toContain("\n    setDialogOpen(false)\n    setSelectedTier(null)\n")
    expect(api).toContain("/api/ccpayment/webhook")
    expect(api).not.toContain("/api/webhooks/ccpayment")
  })

  it("routes CWallet payments through the verified CCPayment invoice flow", () => {
    const api = read("app/api/boosters/route.ts")
    expect(api).toContain("cwallet: ccpaymentEnabled")
    expect(api).toContain('case "cwallet":\n      case "ccpayment": {')
    expect(api).toContain("createOrder")
    expect(api).not.toContain("cwallet.com/checkout")
  })
  it("has a server-side booster activation path", () => {
    const claim = read("app/api/claim/route.ts")
    const migrationFiles = [
      "scripts/079_booster_purchase_atomic.sql",
      "scripts/080_booster_claim_bonus.sql",
    ]
    expect(migrationFiles.every((file) => {
      try { read(file); return true } catch { return false }
    })).toBe(true)
    expect(claim).toContain("booster")
  })
})
