import { createClient, getVerifiedUser } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { NextResponse } from "next/server"
import { z } from "zod"
import { createAuditLog, type AuditLoggerContext } from "@/lib/audit/logger"

const actionSchema = z.object({
  conversionId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  action: z.enum([
    "approve_conversion",
    "reject_conversion",
    "reverse_conversion",
    "enable_provider",
    "disable_provider",
    "update_provider",
  ]),
  notes: z.string().optional(),
  providerUpdates: z
    .object({
      conversion_rate: z.number().optional(),
      min_payout_satoshis: z.number().optional(),
      settings: z.record(z.unknown()).optional(),
    })
    .optional(),
})

const ADMIN_ROLES = ["admin", "superadmin"]

export async function POST(request: Request) {
  try {
    const adminDb = requireAdminClient()
    const supabase = await createClient()

    // SECURITY: LIVE-verified admin identity — offerwall crediting/refund
    // actions cannot run on a stale cookie-derived session.
    const user = await getVerifiedUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role, faucetpay_email, username, display_name")
      .eq("id", user.id)
      .single()

    if (!adminProfile || !ADMIN_ROLES.includes(adminProfile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Parse request
    const body = await request.json()
    const validatedData = actionSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json({ error: "Invalid request", details: validatedData.error.errors }, { status: 400 })
    }

    const { conversionId, providerId, action, notes, providerUpdates } = validatedData.data

    // Create audit logger context
    const auditContext: AuditLoggerContext = {
      supabase,
      adminId: user.id,
      adminRole: adminProfile.role,
      adminEmail: adminProfile.faucetpay_email,
    }

    // Handle conversion actions
    if (action === "approve_conversion" || action === "reject_conversion" || action === "reverse_conversion") {
      if (!conversionId) {
        return NextResponse.json({ error: "conversionId required for conversion actions" }, { status: 400 })
      }

      // Get conversion with user info
      const { data: conversion, error: conversionError } = await supabase
        .from("offerwall_conversions")
        .select("*, profiles!inner(faucetpay_email, balance_satoshis)")
        .eq("id", conversionId)
        .single()

      if (conversionError || !conversion) {
        return NextResponse.json({ error: "Conversion not found" }, { status: 404 })
      }

      const oldData = {
        status: conversion.status,
        processed_at: conversion.processed_at,
      }

      let newStatus: string
      let auditAction:
        | "offerwall_conversion_approved"
        | "offerwall_conversion_rejected"
        | "offerwall_conversion_reversed"

      switch (action) {
        case "approve_conversion":
          if (conversion.status !== "pending") {
            return NextResponse.json({ error: "Conversion is not pending" }, { status: 400 })
          }
          newStatus = "approved"
          auditAction = "offerwall_conversion_approved"

          // Credit balance atomically (row lock + ledger row in one RPC) —
          // the old read-then-write lost updates against concurrent claims.
          const { data: creditResult, error: creditError } = await adminDb.rpc("admin_adjust_balance", {
            p_user_id: conversion.user_id,
            p_delta: conversion.payout_satoshis,
            p_type: "offerwall",
            p_description: `Offerwall: ${conversion.offer_name || conversion.offer_id}`,
            p_metadata: { conversion_id: conversionId, approved_by: user.id },
          })
          if (creditError || !creditResult?.success) {
            console.error("[OfferwallAction] atomic credit failed:", creditError ?? creditResult)
            return NextResponse.json({ error: "Failed to credit user balance" }, { status: 500 })
          }

          // Create notification
          await supabase.from("notifications").insert({
            user_id: conversion.user_id,
            type: "offerwall_completed",
            title: "Offerwall Reward Credited",
            message: `Your offerwall completion has been approved! ${conversion.payout_satoshis} satoshis credited.`,
            data: { conversion_id: conversionId, amount: conversion.payout_satoshis },
          })
          break

        case "reject_conversion":
          if (conversion.status !== "pending") {
            return NextResponse.json({ error: "Conversion is not pending" }, { status: 400 })
          }
          newStatus = "rejected"
          auditAction = "offerwall_conversion_rejected"

          // Create notification
          await supabase.from("notifications").insert({
            user_id: conversion.user_id,
            type: "offerwall_rejected",
            title: "Offerwall Reward Rejected",
            message: notes || "Your offerwall completion was rejected.",
            data: { conversion_id: conversionId, reason: notes },
          })
          break

        case "reverse_conversion":
          if (conversion.status !== "approved") {
            return NextResponse.json({ error: "Can only reverse approved conversions" }, { status: 400 })
          }
          newStatus = "reversed"
          auditAction = "offerwall_conversion_reversed"

          // Debit atomically; overdrafts are REFUSED (the old code silently
          // clamped to 0 and wrote a ledger row claiming the full debit).
          const { data: debitResult, error: debitError } = await adminDb.rpc("admin_adjust_balance", {
            p_user_id: conversion.user_id,
            p_delta: -Number(conversion.payout_satoshis),
            p_type: "adjustment",
            p_description: `Offerwall reversal: ${conversion.offer_name || conversion.offer_id}`,
            p_metadata: { conversion_id: conversionId, reversed_by: user.id, reason: notes },
          })
          if (debitError || !debitResult?.success) {
            console.error("[OfferwallAction] atomic debit failed:", debitError ?? debitResult)
            return NextResponse.json(
              {
                error: debitResult?.error === "INSUFFICIENT_BALANCE"
                  ? `User balance (${debitResult.balance ?? 0} sats) is lower than the payout being reversed`
                  : "Failed to reverse user credit",
              },
              { status: 400 },
            )
          }

          // Create notification
          await supabase.from("notifications").insert({
            user_id: conversion.user_id,
            type: "offerwall_reversed",
            title: "Offerwall Reward Reversed",
            message: notes || "A previous offerwall reward has been reversed.",
            data: { conversion_id: conversionId, amount: conversion.payout_satoshis, reason: notes },
          })
          break

        default:
          return NextResponse.json({ error: "Invalid action" }, { status: 400 })
      }

      const newData = {
        status: newStatus,
        processed_at: new Date().toISOString(),
      }

      // Update conversion status
      const { error: updateError } = await adminDb
        .from("offerwall_conversions")
        .update({
          status: newStatus,
          processed_at: new Date().toISOString(),
          metadata: {
            ...((conversion.metadata as Record<string, unknown>) || {}),
            admin_notes: notes,
            processed_by: user.id,
          },
        })
        .eq("id", conversionId)

      if (updateError) {
        console.error("Conversion update error:", updateError)
        return NextResponse.json({ error: "Failed to update conversion" }, { status: 500 })
      }

      // Create audit log
      await createAuditLog(auditContext, {
        action: auditAction,
        resource_type: "offerwall_conversion",
        resource_id: conversionId,
        old_data: oldData,
        new_data: newData,
        metadata: {
          target_user_id: conversion.user_id,
          target_email: conversion.profiles.faucetpay_email,
          payout_satoshis: conversion.payout_satoshis,
          offer_id: conversion.offer_id,
          offer_name: conversion.offer_name,
          notes,
        },
      })

      return NextResponse.json({ success: true, action, conversionId, newStatus })
    }

    // Handle provider actions
    if (action === "enable_provider" || action === "disable_provider" || action === "update_provider") {
      if (!providerId) {
        return NextResponse.json({ error: "providerId required for provider actions" }, { status: 400 })
      }

      const { data: provider, error: providerError } = await supabase
        .from("offerwall_providers")
        .select("*")
        .eq("id", providerId)
        .single()

      if (providerError || !provider) {
        return NextResponse.json({ error: "Provider not found" }, { status: 404 })
      }

      const oldData = {
        is_enabled: provider.is_enabled,
        conversion_rate: provider.conversion_rate,
        min_payout_satoshis: provider.min_payout_satoshis,
        settings: provider.settings,
      }

      let updateData: Record<string, unknown> = {}
      let auditAction: "offerwall_provider_enabled" | "offerwall_provider_disabled" | "offerwall_provider_updated"

      switch (action) {
        case "enable_provider":
          updateData = { is_enabled: true, updated_at: new Date().toISOString() }
          auditAction = "offerwall_provider_enabled"
          break

        case "disable_provider":
          updateData = { is_enabled: false, updated_at: new Date().toISOString() }
          auditAction = "offerwall_provider_disabled"
          break

        case "update_provider":
          if (!providerUpdates) {
            return NextResponse.json({ error: "providerUpdates required" }, { status: 400 })
          }
          updateData = {
            ...providerUpdates,
            updated_at: new Date().toISOString(),
          }
          auditAction = "offerwall_provider_updated"
          break

        default:
          return NextResponse.json({ error: "Invalid action" }, { status: 400 })
      }

      const { error: updateError } = await supabase.from("offerwall_providers").update(updateData).eq("id", providerId)

      if (updateError) {
        console.error("Provider update error:", updateError)
        return NextResponse.json({ error: "Failed to update provider" }, { status: 500 })
      }

      // Create audit log
      await createAuditLog(auditContext, {
        action: auditAction,
        resource_type: "offerwall_provider",
        resource_id: providerId,
        old_data: oldData,
        new_data: updateData,
        metadata: {
          provider_name: provider.name,
          provider_slug: provider.slug,
          notes,
        },
      })

      return NextResponse.json({ success: true, action, providerId })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Offerwall action error:", error)
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
