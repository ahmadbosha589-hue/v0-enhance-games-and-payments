import { createClient, getVerifiedUser } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { rejectWithdrawalAndRefund } from "@/lib/admin/reject-withdrawal"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { z } from "zod"

const actionSchema = z.object({
  flagId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  action: z.enum(["dismiss", "ban"]),
  notes: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const adminDb = requireAdminClient()
    const supabase = await createClient()
    const headersList = await headers()

    // SECURITY: LIVE-verified admin identity — fraud actions (ban/unban,
    // flag) cannot run on a stale cookie-derived session.
    const user = await getVerifiedUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role, faucetpay_email, username, display_name")
      .eq("id", user.id)
      .single()

    if (!adminProfile || !["admin", "superadmin", "moderator"].includes(adminProfile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Parse request
    const body = await request.json()
    const validatedData = actionSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json({ error: "Invalid request", details: validatedData.error.errors }, { status: 400 })
    }

    const { flagId, userId, action, notes } = validatedData.data

    // Get IP for audit
    const forwarded = headersList.get("x-forwarded-for")
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : null

    let targetEmail: string | null = null
    if (userId) {
      const { data: targetUser } = await supabase.from("profiles").select("faucetpay_email").eq("id", userId).single()
      targetEmail = targetUser?.faucetpay_email || null
    }

    const { data: currentFlag } = await supabase
      .from("fraud_flags")
      .select("status, action_taken, resolution_notes, user_id")
      .eq("id", flagId)
      .single()

    // The flag's OWN user_id is the authoritative ban target. A stale or
    // mismatched client payload must never ban an unrelated account; and a
    // 'ban' with no resolvable target is a silent partial action — reject it.
    if (action === "ban") {
      if (!currentFlag?.user_id) {
        return NextResponse.json({ error: "Fraud flag has no associated user to ban" }, { status: 400 })
      }
      if (userId && userId !== currentFlag.user_id) {
        return NextResponse.json(
          { error: "userId does not match the flagged user", expected: currentFlag.user_id },
          { status: 400 },
        )
      }
    }
    const authoritativeUserId = currentFlag?.user_id || userId || null

    const oldData = currentFlag
      ? {
        status: currentFlag.status,
        action_taken: currentFlag.action_taken,
        resolution_notes: currentFlag.resolution_notes,
      }
      : null

    const newData = {
      status: action === "dismiss" ? "false_positive" : "confirmed_fraud",
      action_taken: action === "dismiss" ? "dismissed" : "banned",
      resolution_notes: notes || (action === "dismiss" ? "Dismissed by admin" : "User banned due to fraud"),
    }

    await adminDb.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: adminProfile.role,
      actor_ip: ipAddress,
      action: action === "dismiss" ? "fraud_flag_dismissed" : "user_banned_fraud",
      resource_type: "fraud_flag",
      resource_id: flagId,
      old_data: oldData,
      new_data: newData,
      metadata: {
        target_user_id: authoritativeUserId,
        target_email: targetEmail,
        actor_email: adminProfile.faucetpay_email || null,
        notes,
      },
    })

    // Update flag status
    const { error: flagError } = await adminDb
      .from("fraud_flags")
      .update({
        status: action === "dismiss" ? "false_positive" : "confirmed_fraud",
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        action_taken: action === "dismiss" ? "dismissed" : "banned",
        resolution_notes: notes || (action === "dismiss" ? "Dismissed by admin" : "User banned due to fraud"),
      })
      .eq("id", flagId)

    if (flagError) {
      console.error("Flag update error:", flagError)
      return NextResponse.json({ error: "Failed to update flag" }, { status: 500 })
    }

    if (action === "ban" && authoritativeUserId) {
      // Ban the flagged user (authoritative id from the flag row)
      const { error: banError } = await adminDb
        .from("profiles")
        .update({
          status: "banned",
          banned_at: new Date().toISOString(),
          banned_reason: notes || "Banned due to fraud flag",
        })
        .eq("id", authoritativeUserId)

      if (banError) {
        console.error("Ban error:", banError)
      }

      // Auto-reject pending withdrawals via the shared atomic refund helper
      // (status-guarded flip + atomic balance credit + ledger row).
      const { data: pendingWithdrawals } = await adminDb
        .from("withdrawals")
        .select("id, user_id, amount_satoshis")
        .eq("user_id", authoritativeUserId)
        .in("status", ["pending", "processing"])

      let refundedCount = 0
      for (const withdrawal of pendingWithdrawals ?? []) {
        const outcome = await rejectWithdrawalAndRefund({
          withdrawalId: withdrawal.id,
          userId: authoritativeUserId,
          amountSatoshis: withdrawal.amount_satoshis,
          reviewNotes: "Automatically rejected due to fraud ban",
          reviewedBy: user.id,
        })
        if (outcome.refunded) refundedCount++
      }

      // Mirror refunds into an audit log entry so they are visible in /admin/audit
      if (refundedCount > 0) {
        await adminDb.from("audit_logs").insert({
          actor_id: user.id,
          actor_role: adminProfile.role,
          actor_ip: ipAddress,
          action: "fraud_ban_withdrawal_refunds",
          resource_type: "user",
          resource_id: authoritativeUserId,
          old_data: {},
          new_data: { refunded_withdrawals: refundedCount },
          metadata: { note: "Pending withdrawals auto-rejected and refunded during fraud ban" },
        })
      }

      // Create notification
      await supabase.from("notifications").insert({
        user_id: authoritativeUserId,
        type: "account_warning",
        title: "Account Suspended",
        message: "Your account has been suspended due to a violation of our terms of service.",
        data: { reason: notes || "Fraud detected" },
      })
    }

    return NextResponse.json({ success: true, action, flagId })
  } catch (error) {
    console.error("Fraud action error:", error)
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}