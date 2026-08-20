import { createHmac } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CCPaymentClient } from "@/lib/ccpayment/client"

describe("CCPayment v2 contract", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("verifies the documented HMAC signature over appId + timestamp + raw body", () => {
    const client = new CCPaymentClient({ appId: "app-123", appSecret: "secret-456" })
    const body = JSON.stringify({ type: "ApiDeposit", msg: { orderId: "order-123" } })
    const timestamp = "1710232720"
    const signature = createHmac("sha256", "secret-456")
      .update(`app-123${timestamp}${body}`)
      .digest("hex")

    expect(client.verifyWebhook(signature, timestamp, body)).toBe(true)
    expect(client.verifyWebhook("0".repeat(64), timestamp, body)).toBe(false)
  })

  it("creates a customer-selected invoice through the documented v2 endpoint", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ code: 10000, msg: "success", data: { invoiceUrl: "https://i.ccpayment.com/test" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    const client = new CCPaymentClient({ appId: "app-123", appSecret: "secret-456" })

    const result = await client.createOrder({
      merchantOrderId: "order-123",
      productPrice: "5.00",
      currency: "USD",
      productName: "Basic Booster",
      notifyUrl: "https://faucero.com/api/ccpayment/webhook",
      returnUrl: "https://faucero.com/dashboard/boosters",
    })

    expect(result.invoiceUrl).toBe("https://i.ccpayment.com/test")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ccpayment.com/ccpayment/v2/createInvoiceUrl",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "User-Agent": "Faucero-CCPayment/1.0" }),
        body: expect.stringContaining('"orderId":"order-123"'),
      }),
    )
  })

  it("queries live token prices through the documented v2 endpoint", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ code: 10000, msg: "success", data: { prices: { "1280": "1.00" } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    const client = new CCPaymentClient({ appId: "app-123", appSecret: "secret-456" })

    const prices = await client.getCoinUSDTPrices(["1280"])

    expect(prices["1280"]).toBe("1.00")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ccpayment.com/ccpayment/v2/getCoinUSDTPrice",
      expect.objectContaining({ body: '{"coinIds":[1280]}' }),
    )
  })

  it("queries invoice order information for webhook reconciliation", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ code: 10000, msg: "success", data: { orderId: "order-123", totalPaidValue: "5.00", paidList: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    const client = new CCPaymentClient({ appId: "app-123", appSecret: "secret-456" })

    await client.getInvoiceOrderInfo("order-123")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ccpayment.com/ccpayment/v2/getInvoiceOrderInfo",
      expect.objectContaining({ body: '{"orderId":"order-123"}' }),
    )
  })
})
