import { createClient, createAdminClient } from "@/lib/supabase/server"
import { rejectWithdrawalAndRefund } from "@/lib/admin/reject-withdrawal"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { z } from "zod"

const actionSchema = z.object({
  withdrawalId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  notes: z.string().optional(),
  reason: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const adminDb = createAdminClient()
    if (!adminDb) {
      return NextResponse.json({ error: "Admin database unavailable" }, { status: 503 })
    }
    const supabase = await createClient()
    const headersList = await headers()

    // Verify admin
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role, faucetpay_email, username, display_name")
      .eq("id", user.id)
      .single()

    if (!adminProfile || !["admin", "superadmin"].includes(adminProfile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Parse request
    const body = await request.json()
    const validatedData = actionSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json({ error: "Invalid request", details: validatedData.error.errors }, { status: 400 })
    }

    const { withdrawalId, action, notes, reason } = validatedData.data
    const rejectionReason = notes || reason

    // Get withdrawal
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("id", withdrawalId)
      .single()

    if (withdrawalError || !withdrawal) {
      return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 })
    }

    if (withdrawal.status !== "pending") {
      return NextResponse.json(
        { error: "Withdrawal already processed", message: `Current status: ${withdrawal.status}` },
        { status: 400 },
      )
    }

    // Get IP for audit
    const forwarded = headersList.get("x-forwarded-for")
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : null

    const { data: targetUser } = await supabase
      .from("profiles")
      .select("faucetpay_email")
      .eq("id", withdrawal.user_id)
      .single()

    const oldData = { status: withdrawal.status }
    const newData = { status: action === "approve" ? "pending" : "rejected" }

    await adminDb.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: adminProfile.role,
      actor_ip: ipAddress,
      action: action === "approve" ? "withdrawal_approved" : "withdrawal_rejected",
      resource_type: "withdrawal",
      resource_id: withdrawalId,
      old_data: oldData,
      new_data: newData,
      metadata: {
        withdrawal_user_id: withdrawal.user_id,
        target_user_id: withdrawal.user_id,
        target_email: targetUser?.faucetpay_email || null,
        actor_email: adminProfile.faucetpay_email || null,
        amount: withdrawal.amount_satoshis,
        reason: rejectionReason,
      },
    })

    if (action === "approve") {
      // Move to a DISTINCT 'approved' state so a second admin cannot reject an
      // already-approved payout (the old code wrote status back to 'pending',
      // allowing approve -> cron pays -> reject refunds an already-paid payout).
      // The FaucetPay payout worker claims rows in 'approved' and marks them
      // 'completed' when paid.
      const { data: claimed, error: claimError } = await adminDb
        .from("withdrawals")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          review_notes: rejectionReason || "Approved for provider processing",
        })
        .eq("id", withdrawalId)
        .eq("status", "pending") // atomic claim: only if still pending
        .select("id")

      if (claimError) {
        return NextResponse.json({ error: "Failed to approve withdrawal", details: claimError.message }, { status: 500 })
      }
      if (!claimed || claimed.length === 0) {
        return NextResponse.json({ error: "Withdrawal already processed", message: `Current status changed concurrently` }, { status: 409 })
      }

      return NextResponse.json({ success: true, action, withdrawalId, status: "approved", reviewed: true })
    } else {
      // Reject + refund atomically via the shared helper:
      // conditional status flip (never rejects an already-paid/approved row),
      // balance increment RPC, total_withdrawn decrement, ledger row.
      const outcome = await rejectWithdrawalAndRefund({
        withdrawalId,
        userId: withdrawal.user_id,
        amountSatoshis: withdrawal.amount_satoshis,
        reviewNotes: rejectionReason || "Rejected by admin",
        reviewedBy: user.id,
      })

      if (!outcome.refunded) {
        if (outcome.error === "ALREADY_PROCESSED") {
          return NextResponse.json(
            { error: "Withdrawal already processed", message: `Current status: ${withdrawal.status}` },
            { status: 409 },
          )
        }
        return NextResponse.json(
          { error: "Failed to refund rejected withdrawal", details: outcome.error },
          { status: 500 },
        )
      }

      // Mark any linked pending transaction failed (best-effort; refund is done)
      await adminDb
        .from("transactions")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          description: rejectionReason || "Withdrawal rejected by admin",
        })
        .eq("withdrawal_id", withdrawalId)
        .eq("status", "pending")

      // Create notification with reason
      await adminDb.from("notifications").insert({
        user_id: withdrawal.user_id,
        type: "withdrawal_failed",
        title: "Withdrawal Rejected",
        message: rejectionReason
          ? `Your withdrawal was rejected: ${rejectionReason}. ${withdrawal.amount_satoshis} satoshis have been refunded.`
          : `Your withdrawal was rejected. ${withdrawal.amount_satoshis} satoshis have been refunded to your balance.`,
        data: { withdrawal_id: withdrawalId, amount: withdrawal.amount_satoshis, reason: rejectionReason },
        is_read: false,
      })
    }

    return NextResponse.json({ success: true, action, withdrawalId })
  } catch (error) {
    console.error("Withdrawal action error:", error)
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
