import { createClient } from "@/lib/supabase/server"
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
      .select("status, action_taken, resolution_notes")
      .eq("id", flagId)
      .single()

    const oldData = currentFlag
      ? {
          status: currentFlag.status,
          action_taken: currentFlag.action_taken,
          resolution_notes: currentFlag.resolution_notes,
        }
      : null

    const newData = {
      status: action === "dismiss" ? "dismissed" : "resolved",
      action_taken: action === "dismiss" ? "dismissed" : "banned",
      resolution_notes: notes || (action === "dismiss" ? "Dismissed by admin" : "User banned due to fraud"),
    }

    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      actor_role: adminProfile.role,
      actor_ip: ipAddress,
      action: action === "dismiss" ? "fraud_flag_dismissed" : "user_banned_fraud",
      resource_type: "fraud_flag",
      resource_id: flagId,
      old_data: oldData,
      new_data: newData,
      metadata: {
        target_user_id: userId,
        target_email: targetEmail,
        actor_email: adminProfile.faucetpay_email || null,
        notes,
      },
    })

    // Update flag status
    const { error: flagError } = await supabase
      .from("fraud_flags")
      .update({
        status: action === "dismiss" ? "dismissed" : "resolved",
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

    if (action === "ban" && userId) {
      // Ban the user
      const { error: banError } = await supabase
        .from("profiles")
        .update({
          status: "banned",
          banned_at: new Date().toISOString(),
          banned_reason: notes || "Banned due to fraud flag",
        })
        .eq("id", userId)

      if (banError) {
        console.error("Ban error:", banError)
      }

      // Reject all pending withdrawals for this user
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
          const { data: userProfile } = await supabase
            .from("profiles")
            .select("balance_satoshis")
            .eq("id", userId)
            .single()

          if (userProfile) {
            await supabase
              .from("profiles")
              .update({
                balance_satoshis: Number(userProfile.balance_satoshis) + Number(withdrawal.amount_satoshis),
              })
              .eq("id", userId)
          }
        }
      }

      // Create notification
      await supabase.from("notifications").insert({
        user_id: userId,
        type: "account_banned",
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
