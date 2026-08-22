import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { log } from "@/lib/logger"

/**
 * Shared admin withdrawal rejection + refund.
 *
 * Used by: /api/admin/withdrawals/action (reject) and the ban cascade in
 * /api/admin/users/action. Guarantees, per withdrawal:
 *  - balance credited ATOMICALLY via increment_refund RPC (no read-then-write
 *    lost-update race, no stale-balance overwrite when refunding several rows)
 *  - total_withdrawn_satoshis decremented
 *  - a completed 'adjustment' ledger row written (amount negative = refund out
 *    of the withdrawn tally back to balance)
 *  - status flipped with a conditional .eq("status", ...) guard so a row that
 *    was concurrently paid/approved is NOT rejected-and-refunded
 *
 * Returns per-withdrawal outcomes so callers can report partial failures.
 */

export interface RejectRefundInput {
  withdrawalId: string
  userId: string
  amountSatoshis: number
  /** 'rejected' for manual reject, 'rejected' + note for ban cascade */
  reviewNotes: string
  reviewedBy: string
  notification?: { title: string; message: string }
}

export interface RejectRefundOutcome {
  withdrawalId: string
  refunded: boolean
  error?: string
}

export async function rejectWithdrawalAndRefund(
  input: RejectRefundInput,
): Promise<RejectRefundOutcome> {
  const admin = createAdminClient()
  if (!admin) {
    return { withdrawalId: input.withdrawalId, refunded: false, error: "Admin database unavailable" }
  }

  // 1) Conditionally flip the row ONLY while it is still pending/processing.
  //    If the FaucetPay worker paid it in the meantime, the update matches 0
  //    rows and we skip the refund — preventing payout + refund double-credit.
  const { data: flipped, error: flipError } = await admin
    .from("withdrawals")
    .update({
      status: "rejected",
      review_notes: input.reviewNotes,
      reviewed_at: new Date().toISOString(),
      reviewed_by: input.reviewedBy,
    })
    .eq("id", input.withdrawalId)
    .in("status", ["pending", "processing"])
    .select("id")

  if (flipError) {
    log.error("[rejectWithdrawalAndRefund] status flip failed", { withdrawalId: input.withdrawalId, error: flipError })
    return { withdrawalId: input.withdrawalId, refunded: false, error: flipError.message }
  }

  if (!flipped || flipped.length === 0) {
    // Row was concurrently approved/paid/completed — do NOT refund it.
    return { withdrawalId: input.withdrawalId, refunded: false, error: "ALREADY_PROCESSED" }
  }

  // 2) Atomic balance credit + total_withdrawn decrement + ledger row.
  const { data: rpcResult, error: rpcError } = await admin.rpc("admin_reject_withdrawal_refund", {
    p_user_id: input.userId,
    p_withdrawal_id: input.withdrawalId,
    p_amount: input.amountSatoshis,
    p_description: input.reviewNotes,
    p_actor: input.reviewedBy,
  })

  if (rpcError || !rpcResult?.success) {
    log.error("[rejectWithdrawalAndRefund] atomic refund failed", { withdrawalId: input.withdrawalId, error: rpcError ?? rpcResult })
    return { withdrawalId: input.withdrawalId, refunded: false, error: rpcError?.message || rpcResult?.error || "REFUND_RPC_FAILED" }
  }

  // 3) Best-effort notification (failure here must not fail the refund).
  if (input.notification) {
    try {
      await admin.from("notifications").insert({
        user_id: input.userId,
        type: "withdrawal_rejected",
        title: input.notification.title,
        message: input.notification.message,
        is_read: false,
      })
    } catch (e) {
      log.warn("[rejectWithdrawalAndRefund] notification failed", { withdrawalId: input.withdrawalId, e })
    }
  }

  return { withdrawalId: input.withdrawalId, refunded: true }
}
