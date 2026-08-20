import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const route = readFileSync(resolve(process.cwd(), "app/api/ccpayment/webhook/route.ts"), "utf8")

describe("CCPayment webhook v2 contract", () => {
  it("handles ApiDeposit msg fields and reconciles before fulfillment", () => {
    expect(route).toContain('data.type === "ApiDeposit"')
    expect(route).toContain("msg.orderId")
    expect(route).toContain("msg.recordId")
    expect(route).toContain("getInvoiceOrderInfo")
    expect(route).toContain("reconcileInvoicePayment")
    expect(route).toContain('new Response("Success"')
  })

  it("does not use the obsolete Payment.Success order fields", () => {
    expect(route).not.toContain('case "Payment.Success"')
    expect(route).not.toContain("data.order_id")
  })
})
