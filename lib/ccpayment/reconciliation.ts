export interface InvoicePaymentEntry {
  recordId?: string
  status?: string
  paidValue?: string
  amount?: string
  rate?: string
  isFlaggedAsRisky?: boolean
  txid?: string
}

export interface InvoicePaymentOrder {
  totalPaidValue?: string
  paidList?: InvoicePaymentEntry[]
}

export interface InvoiceReconciliationResult {
  eligible: boolean
  paidValue: number
  transactionHash?: string
  reason?: "missing_record" | "processing" | "risky" | "underpaid" | "invalid_amount"
}

/**
 * CCPayment's webhook is only a notification. Fulfillment is allowed only
 * after the invoice order query confirms a successful, non-risky payment.
 */
export function reconcileInvoicePayment(
  order: InvoicePaymentOrder,
  expectedValue: number,
  webhookRecordId?: string,
): InvoiceReconciliationResult {
  if (!Number.isFinite(expectedValue) || expectedValue <= 0) {
    return { eligible: false, paidValue: 0, reason: "invalid_amount" }
  }

  const entries = order.paidList || []
  const matching = webhookRecordId
    ? entries.filter((entry) => entry.recordId === webhookRecordId)
    : entries

  if (matching.length === 0) {
    return { eligible: false, paidValue: 0, reason: "missing_record" }
  }

  if (matching.some((entry) => entry.status !== "Success")) {
    return { eligible: false, paidValue: 0, reason: "processing" }
  }

  if (matching.some((entry) => entry.isFlaggedAsRisky === true)) {
    return { eligible: false, paidValue: 0, reason: "risky" }
  }

  const listedTotal = Number(order.totalPaidValue)
  const entryTotal = matching.reduce((sum, entry) => {
    const amount = Number(entry.paidValue ?? entry.amount)
    const rate = Number(entry.rate)
    const value = entry.paidValue !== undefined || !Number.isFinite(rate) ? amount : amount * rate
    return Number.isFinite(value) ? sum + value : sum
  }, 0)
  const paidValue = Number.isFinite(listedTotal) ? listedTotal : entryTotal

  if (!Number.isFinite(paidValue)) {
    return { eligible: false, paidValue: 0, reason: "invalid_amount" }
  }

  if (paidValue + Number.EPSILON < expectedValue) {
    return { eligible: false, paidValue, reason: "underpaid" }
  }

  return {
    eligible: true,
    paidValue,
    transactionHash: matching.find((entry) => entry.txid)?.txid,
  }
}
