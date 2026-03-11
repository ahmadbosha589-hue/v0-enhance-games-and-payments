import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { z } from "zod"

const adminUserActionSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["ban", "unban", "flag", "unflag", "reset_fraud_score", "adjust_balance"]),
  reason: z.string().optional(),
  amount: z.number().optional(),
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

    if (!adminProfile || !["admin", "superadmin", "moderator"].includes(adminProfile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Parse request
    const body = await request.json()
    const validatedData = adminUserActionSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json({ error: "Invalid request", details: validatedData.error.errors }, { status: 400 })
    }

    const { userId, action, reason, amount } = validatedData.data

    // Get IP for audit
    const forwarded = headersList.get("x-forwarded-for")
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : null

    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("*, faucetpay_email")
      .eq("id", userId)
      .single()

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Perform action with correct column names
    let updateData: Record<string, unknown> = {}
    let oldData: Record<string, unknown> = {}
    let newData: Record<string, unknown> = {}

    switch (action) {
      case "ban":
        oldData = { status: targetProfile.status, banned_at: targetProfile.banned_at }
        updateData = {
          status: "banned",
          banned_at: new Date().toISOString(),
          banned_reason: reason || "Banned by admin",
        }
        newData = updateData

        const { data: pendingWithdrawals } = await supabase
          .from("withdrawals")
          .select("id, amount_satoshis")
          .eq("user_id", userId)
          .in("status", ["pending", "processing"])

        if (pendingWithdrawals && pendingWithdrawals.length > 0) {
          for (const withdrawal of pendingWithdrawals) {
            await supabase
              .from("withdrawals")
              .update({
                status: "rejected",
                review_notes: "Automatically rejected due to account ban",
                reviewed_at: new Date().toISOString(),
                reviewed_by: user.id,
              })
              .eq("id", withdrawal.id)

            // Refund the amount
            await supabase
              .from("profiles")
              .update({
                balance_satoshis: Number(targetProfile.balance_satoshis) + Number(withdrawal.amount_satoshis),
              })
              .eq("id", userId)
          }
        }

        // Create notification
        await supabase.from("notifications").insert({
          user_id: userId,
          type: "account_banned",
          title: "Account Suspended",
          message: reason || "Your account has been suspended due to a violation of our terms of service.",
          data: { reason },
        })
        break

      case "unban":
        oldData = { status: targetProfile.status, banned_at: targetProfile.banned_at }
        updateData = {
          status: "active",
          banned_at: null,
          banned_reason: null,
        }
        newData = updateData

        // Create notification
        await supabase.from("notifications").insert({
          user_id: userId,
          type: "account_unbanned",
          title: "Account Restored",
          message: "Your account has been restored. Welcome back!",
        })
        break

      case "flag":
        oldData = { is_flagged: targetProfile.is_flagged }
        updateData = { is_flagged: true }
        newData = updateData
        break

      case "unflag":
        oldData = { is_flagged: targetProfile.is_flagged }
        updateData = { is_flagged: false }
        newData = updateData
        break

      case "reset_fraud_score":
        oldData = { fraud_score: targetProfile.fraud_score, is_flagged: targetProfile.is_flagged }
        updateData = { fraud_score: 0, is_flagged: false }
        newData = updateData

        await supabase
          .from("fraud_flags")
          .update({
            status: "dismissed",
            resolved_by: user.id,
            resolved_at: new Date().toISOString(),
            action_taken: "score_reset",
            resolution_notes: "Fraud score reset by admin",
          })
          .eq("user_id", userId)
          .eq("status", "pending")
        break

      case "adjust_balance":
        if (amount === undefined) {
          return NextResponse.json({ error: "Amount required for balance adjustment" }, { status: 400 })
        }
        oldData = { balance_satoshis: targetProfile.balance_satoshis }
        const newBalance = Math.max(0, Number(targetProfile.balance_satoshis) + amount)
        updateData = { balance_satoshis: newBalance }
        newData = { balance_satoshis: newBalance, adjustment: amount }

        await supabase.from("transactions").insert({
          user_id: userId,
          type: "adjustment",
          status: "completed",
          amount_satoshis: Math.abs(amount),
          balance_before: Number(targetProfile.balance_satoshis),
          balance_after: newBalance,
          description: reason || `Balance ${amount > 0 ? "credit" : "debit"} by admin`,
          metadata: { admin_id: user.id, reason },
          completed_at: new Date().toISOString(),
        })

        // Create notification
        await supabase.from("notifications").insert({
          user_id: userId,
          type: "balance_adjusted",
          title: amount > 0 ? "Balance Credit" : "Balance Debit",
          message: `Your balance has been ${amount > 0 ? "credited" : "debited"} by ${Math.abs(amount)} satoshis.${reason ? ` Reason: ${reason}` : ""}`,
          data: { amount, reason },
        })
        break
    }

    const auditLogEntry = {
      actor_id: user.id,
      actor_role: adminProfile.role,
      actor_ip: ipAddress,
      action: `admin_${action}`,
      resource_type: "user",
      resource_id: userId,
      old_data: oldData,
      new_data: newData,
      metadata: {
        target_user_id: userId,
        target_email: targetProfile.faucetpay_email || null,
        actor_email: adminProfile.faucetpay_email || null,
        reason,
        amount,
      },
    }

    // Insert audit log first
    await supabase.from("audit_logs").insert(auditLogEntry)

    const { error } = await supabase.from("profiles").update(updateData).eq("id", userId)

    if (error) {
      console.error("Update error:", error)
      await supabase.from("audit_logs").insert({
        ...auditLogEntry,
        action: `admin_${action}_failed`,
        metadata: { ...auditLogEntry.metadata, error: error.message },
      })
      return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
    }

    return NextResponse.json({ success: true, action, userId })
  } catch (error) {
    console.error("Admin action error:", error)
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
