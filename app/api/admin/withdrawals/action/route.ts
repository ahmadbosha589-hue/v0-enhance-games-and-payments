import { createClient } from "@/lib/supabase/server"
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
    const newData = { status: action === "approve" ? "processing" : "rejected" }

    await supabase.from("audit_logs").insert({
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
      // Update to processing
      await supabase
        .from("withdrawals")
        .update({
          status: "processing",
          processed_at: new Date().toISOString(),
          processed_by: user.id,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq("id", withdrawalId)

      // The cron worker performs the real FaucetPay payout. Do not mark a
      // withdrawal completed or fabricate a payout ID before the provider returns success.
      return NextResponse.json({ success: true, action, withdrawalId, status: "processing" })
    } else {
      // Reject and refund - get user profile with correct column names
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("balance_satoshis, total_withdrawn_satoshis")
        .eq("id", withdrawal.user_id)
        .single()

      if (userProfile) {
        // Refund the amount to user's balance
        await supabase
          .from("profiles")
          .update({
            balance_satoshis: Number(userProfile.balance_satoshis) + Number(withdrawal.amount_satoshis),
            total_withdrawn_satoshis: Math.max(
              0,
              Number(userProfile.total_withdrawn_satoshis) - Number(withdrawal.amount_satoshis),
            ),
          })
          .eq("id", withdrawal.user_id)
      }

      // Update withdrawal status with notes
      await supabase
        .from("withdrawals")
        .update({
          status: "rejected",
          review_notes: rejectionReason || "Rejected by admin",
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          processed_at: new Date().toISOString(),
          processed_by: user.id,
        })
        .eq("id", withdrawalId)

      // Update transaction to failed
      await supabase
        .from("transactions")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          description: rejectionReason || "Withdrawal rejected by admin",
        })
        .eq("withdrawal_id", withdrawalId)

      // Create refund transaction
      await supabase.from("transactions").insert({
        user_id: withdrawal.user_id,
        type: "adjustment",
        status: "completed",
        amount_satoshis: withdrawal.amount_satoshis,
        balance_before: Number(userProfile?.balance_satoshis || 0),
        balance_after: Number(userProfile?.balance_satoshis || 0) + Number(withdrawal.amount_satoshis),
        withdrawal_id: withdrawalId,
        description: "Refund for rejected withdrawal",
        metadata: { reason: rejectionReason || "Withdrawal rejected", original_withdrawal_id: withdrawalId },
        completed_at: new Date().toISOString(),
      })

      // Create notification with reason
      await supabase.from("notifications").insert({
        user_id: withdrawal.user_id,
        type: "withdrawal_failed",
        title: "Withdrawal Rejected",
        message: rejectionReason
          ? `Your withdrawal was rejected: ${rejectionReason}. ${withdrawal.amount_satoshis} satoshis have been refunded.`
          : `Your withdrawal was rejected. ${withdrawal.amount_satoshis} satoshis have been refunded to your balance.`,
        data: { withdrawal_id: withdrawalId, amount: withdrawal.amount_satoshis, reason: rejectionReason },
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
