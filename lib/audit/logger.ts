// Centralized Audit Logger
// Provides a consistent interface for logging admin actions across the platform

import type { SupabaseClient } from "@supabase/supabase-js"
import { headers } from "next/headers"

export type AuditAction =
  | "admin_ban"
  | "admin_unban"
  | "admin_flag"
  | "admin_unflag"
  | "admin_reset_fraud_score"
  | "admin_adjust_balance"
  | "admin_ban_failed"
  | "withdrawal_approved"
  | "withdrawal_rejected"
  | "fraud_flag_dismissed"
  | "user_banned_fraud"
  | "update_system_settings"
  | "offerwall_conversion_approved"
  | "offerwall_conversion_rejected"
  | "offerwall_conversion_reversed"
  | "offerwall_provider_enabled"
  | "offerwall_provider_disabled"
  | "offerwall_provider_updated"
  | "ptc_ad_approved"
  | "ptc_ad_rejected"

export type ResourceType =
  | "user"
  | "withdrawal"
  | "fraud_flag"
  | "system_settings"
  | "offerwall_conversion"
  | "offerwall_provider"
  | "ptc_ad"

export interface AuditLogEntry {
  actor_id: string
  actor_role: string
  actor_ip: string | null
  action: AuditAction
  resource_type: ResourceType
  resource_id: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata?: Record<string, unknown>
}

export interface AuditLoggerContext {
  supabase: SupabaseClient
  adminId: string
  adminRole: string
  adminEmail?: string | null
}

/**
 * Get the client IP address from request headers
 */
export async function getClientIp(): Promise<string | null> {
  const headersList = await headers()
  const forwarded = headersList.get("x-forwarded-for")
  return forwarded ? forwarded.split(",")[0].trim() : null
}

/**
 * Create an audit log entry
 * This function should be called for every admin action
 */
export async function createAuditLog(
  context: AuditLoggerContext,
  entry: Omit<AuditLogEntry, "actor_id" | "actor_role" | "actor_ip">,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ipAddress = await getClientIp()

    const { error } = await context.supabase.from("audit_logs").insert({
      actor_id: context.adminId,
      actor_role: context.adminRole,
      actor_ip: ipAddress,
      action: entry.action,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      old_data: entry.old_data,
      new_data: entry.new_data,
      metadata: {
        ...entry.metadata,
        actor_email: context.adminEmail || null,
      },
    })

    if (error) {
      console.error("Failed to create audit log:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error("Audit log error:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

/**
 * Create a failed action audit log entry
 * Use this when an admin action fails to record the attempt
 */
export async function createFailedActionAuditLog(
  context: AuditLoggerContext,
  entry: Omit<AuditLogEntry, "actor_id" | "actor_role" | "actor_ip">,
  errorMessage: string,
): Promise<void> {
  try {
    const ipAddress = await getClientIp()

    await context.supabase.from("audit_logs").insert({
      actor_id: context.adminId,
      actor_role: context.adminRole,
      actor_ip: ipAddress,
      action: `${entry.action}_failed` as AuditAction,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      old_data: entry.old_data,
      new_data: entry.new_data,
      metadata: {
        ...entry.metadata,
        actor_email: context.adminEmail || null,
        error: errorMessage,
      },
    })
  } catch (err) {
    // Log but don't throw - we don't want to fail the main operation
    console.error("Failed to create failed action audit log:", err)
  }
}
