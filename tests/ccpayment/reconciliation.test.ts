import { describe, expect, it } from "vitest"
import { reconcileInvoicePayment } from "@/lib/ccpayment/reconciliation"

describe("CCPayment invoice reconciliation", () => {
  it("accepts a fully paid non-risky record", () => {
    expect(reconcileInvoicePayment({
      totalPaidValue: "5.00",
      paidList: [{ recordId: "record-1", status: "Success", paidValue: "5.00", isFlaggedAsRisky: false, txid: "tx-1" }],
    }, 5, "record-1")).toEqual({ eligible: true, transactionHash: "tx-1", paidValue: 5 })
  })

  it("rejects risky, processing, and underpaid records", () => {
    expect(reconcileInvoicePayment({
      totalPaidValue: "5.00",
      paidList: [{ recordId: "record-1", status: "Success", paidValue: "5.00", isFlaggedAsRisky: true }],
    }, 5, "record-1").eligible).toBe(false)
    expect(reconcileInvoicePayment({
      totalPaidValue: "5.00",
      paidList: [{ recordId: "record-1", status: "Processing", paidValue: "5.00", isFlaggedAsRisky: false }],
    }, 5, "record-1").eligible).toBe(false)
    expect(reconcileInvoicePayment({
      totalPaidValue: "4.99",
      paidList: [{ recordId: "record-1", status: "Success", paidValue: "4.99", isFlaggedAsRisky: false }],
    }, 5, "record-1").eligible).toBe(false)
  })
})
