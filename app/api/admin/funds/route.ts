import { createAdminClient, getUser, getProfile } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { log } from "@/lib/logger"
import { z } from "zod"
import { v4 as uuidv4 } from "uuid"

export const dynamic = "force-dynamic"

// =============================================================================
// VALIDATION SCHEMAS - Strict input validation to prevent invalid operations
// =============================================================================

const adjustBalanceSchema = z.object({
  userId: z.string().uuid("Invalid user ID format"),
  type: z.enum(["ad_balance", "satoshis"], { errorMap: () => ({ message: "Type must be 'ad_balance' or 'satoshis'" }) }),
  action: z.enum(["add", "subtract", "set"], { errorMap: () => ({ message: "Action must be 'add', 'subtract', or 'set'" }) }),
  amount: z.number()
    .min(0, "Amount cannot be negative")
    .max(1_000_000_000, "Amount exceeds maximum allowed (1 billion)"), // Safety cap
  reason: z.string()
    .min(3, "Reason must be at least 3 characters")
    .max(500, "Reason cannot exceed 500 characters")
})

const activateBoosterSchema = z.object({
  userId: z.string().uuid("Invalid user ID format"),
  boosterTierId: z.string().min(1, "Booster tier ID is required"),
  durationDays: z.number().min(1).max(365).optional(),
  reason: z.string()
    .min(3, "Reason must be at least 3 characters")
    .max(500, "Reason cannot exceed 500 characters")
})

const paymentActionSchema = z.object({
  purchaseId: z.string().uuid("Invalid purchase ID format"),
  transactionHash: z.string().optional(),
  reason: z.string().max(500).optional()
})

// =============================================================================
// HELPER: Create idempotency key for balance adjustments
// =============================================================================

function createIdempotencyKey(adminId: string, userId: string, type: string, action: string, amount: number): string {
  const timestamp = Math.floor(Date.now() / 60000) // Minute-level granularity
  return `adj_${adminId}_${userId}_${type}_${action}_${amount}_${timestamp}`
}

// =============================================================================
// HELPER: Verify admin permissions with detailed logging
// =============================================================================

async function verifyAdminPermissions(requestType: string) {
  const user = await getUser()
  if (!user) {
    log.warn("Unauthorized funds access attempt", { requestType })
    return { error: "Unauthorized", status: 401, user: null, profile: null }
  }

  const profile = await getProfile(user.id)
  if (!profile || !["admin", "superadmin"].includes(profile.role)) {
    log.warn("Forbidden funds access attempt", { requestType, userId: user.id, role: profile?.role })
    return { error: "Forbidden - Admin access required", status: 403, user: null, profile: null }
  }

  return { error: null, status: 200, user, profile }
}

// =============================================================================
// GET - Get funds overview for admin (read-only, safe operations)
// =============================================================================

export async function GET(request: Request) {
  try {
    const authResult = await verifyAdminPermissions("GET")
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      return NextResponse.json({ error: "Database connection failed" }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action")

    // Get total platform funds overview
    if (action === "overview") {
      // Total satoshi balances
      const { data: satoshiData } = await adminSupabase
        .from("profiles")
        .select("balance_satoshis")

      const totalSatoshis = satoshiData?.reduce((sum, p) => sum + Number(p.balance_satoshis || 0), 0) || 0

      // Total advertising balances
      const { data: adData } = await adminSupabase
        .from("profiles")
        .select("ad_balance_usd")

      const totalAdBalance = adData?.reduce((sum, p) => sum + Number(p.ad_balance_usd || 0), 0) || 0

      // Pending withdrawals
      const { data: withdrawals } = await adminSupabase
        .from("withdrawals")
        .select("amount")
        .eq("status", "pending")

      const pendingWithdrawals = withdrawals?.reduce((sum, w) => sum + Number(w.amount || 0), 0) || 0

      // Booster revenue (completed purchases)
      const { data: boosterRevenue } = await adminSupabase
        .from("booster_purchases")
        .select("amount_usd")
        .eq("payment_status", "completed")

      const totalBoosterRevenue = boosterRevenue?.reduce((sum, p) => sum + Number(p.amount_usd || 0), 0) || 0

      // Active campaigns spending
      const { data: campaigns } = await adminSupabase
        .from("ad_campaigns")
        .select("spent, budget")
        .in("status", ["active", "pending"])

      const totalCampaignSpent = campaigns?.reduce((sum, c) => sum + Number(c.spent || 0), 0) || 0
      const totalCampaignBudget = campaigns?.reduce((sum, c) => sum + Number(c.budget || 0), 0) || 0

      // Recent deposits
      const { data: recentDeposits } = await adminSupabase
        .from("ccpayment_deposits")
        .select("*")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(10)

      return NextResponse.json({
        overview: {
          totalSatoshis,
          totalSatoshisUsd: (totalSatoshis / 100000000) * 65000, // Approximate BTC price
          totalAdBalance,
          pendingWithdrawals,
          totalBoosterRevenue,
          totalCampaignSpent,
          totalCampaignBudget,
          recentDeposits
        }
      })
    }

    // Get user balances for management
    if (action === "users") {
      const search = searchParams.get("search") || ""
      const limit = Math.min(Number(searchParams.get("limit")) || 50, 100)
      const offset = Number(searchParams.get("offset")) || 0

      let query = adminSupabase
        .from("profiles")
        .select("id, username, email, display_name, balance_satoshis, ad_balance_usd, role, created_at")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1)

      if (search) {
        query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%,display_name.ilike.%${search}%`)
      }

      const { data: users, error } = await query

      if (error) throw error

      return NextResponse.json({ users })
    }

    // Get pending manual crypto payments
    if (action === "pending_payments") {
      const { data: pendingPayments } = await adminSupabase
        .from("booster_purchases")
        .select(`
          *,
          profiles!booster_purchases_user_id_fkey (username, email, display_name),
          booster_tiers!booster_purchases_booster_tier_id_fkey (name, duration_days)
        `)
        .eq("payment_status", "pending")
        .eq("payment_method", "manual_crypto")
        .order("created_at", { ascending: false })

      return NextResponse.json({ pendingPayments })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    log.error("Admin funds GET error", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// =============================================================================
// POST - Manage user funds (CRITICAL - Maximum safety required)
// =============================================================================

export async function POST(request: Request) {
  const operationId = uuidv4() // Unique ID for tracking this operation across logs

  try {
    const authResult = await verifyAdminPermissions("POST")
    if (authResult.error || !authResult.user) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      log.error("Database connection failed for funds operation", { operationId })
      return NextResponse.json({ error: "Database connection failed" }, { status: 503 })
    }

    const body = await request.json()
    const { action } = body

    // =========================================================================
    // BALANCE ADJUSTMENT - Most critical operation, requires maximum safety
    // =========================================================================
    if (action === "adjust_balance") {
      const validated = adjustBalanceSchema.safeParse(body)
      if (!validated.success) {
        return NextResponse.json({
          error: "Invalid request",
          details: validated.error.issues.map(i => i.message)
        }, { status: 400 })
      }

      const { userId, type, action: balanceAction, amount, reason } = validated.data
      const field = type === "satoshis" ? "balance_satoshis" : "ad_balance_usd"

      // Create idempotency key to prevent duplicate operations
      const idempotencyKey = createIdempotencyKey(authResult.user.id, userId, type, balanceAction, amount)

      // Check for duplicate operation (idempotency check)
      const { data: existingOp } = await adminSupabase
        .from("admin_audit_logs")
        .select("id, created_at")
        .eq("idempotency_key", idempotencyKey)
        .single()

      if (existingOp) {
        log.warn("Duplicate balance adjustment blocked", {
          operationId,
          idempotencyKey,
          existingOpId: existingOp.id
        })
        return NextResponse.json({
          error: "Duplicate operation detected. This adjustment was already processed recently.",
          existingOperationId: existingOp.id
        }, { status: 409 })
      }

      // STEP 1: Get current balance with FOR UPDATE lock simulation
      // We use a select-then-update pattern with version checking
      const { data: targetProfile, error: fetchError } = await adminSupabase
        .from("profiles")
        .select(`id, ${field}, username, updated_at`)
        .eq("id", userId)
        .single()

      if (fetchError || !targetProfile) {
        log.error("User not found for balance adjustment", { operationId, userId })
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }

      const currentValue = Number(targetProfile[field] || 0)
      const originalUpdatedAt = targetProfile.updated_at

      // STEP 2: Calculate new value with safety bounds
      let newValue: number
      switch (balanceAction) {
        case "add":
          newValue = currentValue + amount
          // Check for overflow
          if (newValue < currentValue) {
            return NextResponse.json({ error: "Operation would cause numeric overflow" }, { status: 400 })
          }
          break
        case "subtract":
          newValue = currentValue - amount
          // Prevent negative balance
          if (newValue < 0) {
            log.warn("Attempted to set negative balance", {
              operationId, userId, currentValue, amount, newValue
            })
            return NextResponse.json({
              error: `Insufficient balance. Current: ${currentValue.toLocaleString()}, Attempting to subtract: ${amount.toLocaleString()}`,
              currentBalance: currentValue
            }, { status: 400 })
          }
          break
        case "set":
          newValue = amount
          break
        default:
          return NextResponse.json({ error: "Invalid balance action" }, { status: 400 })
      }

      // STEP 3: Create audit log FIRST (before balance change) for traceability
      const auditLogId = uuidv4()
      const { error: auditPreError } = await adminSupabase
        .from("admin_audit_logs")
        .insert({
          id: auditLogId,
          admin_id: authResult.user.id,
          action: "balance_adjustment_initiated",
          target_user_id: userId,
          idempotency_key: idempotencyKey,
          details: {
            operationId,
            type,
            balanceAction,
            amount,
            previousValue: currentValue,
            intendedNewValue: newValue,
            reason,
            profileVersionBefore: originalUpdatedAt
          }
        })

      if (auditPreError) {
        log.error("Failed to create pre-audit log", { operationId, error: auditPreError })
        return NextResponse.json({ error: "Failed to initialize operation audit" }, { status: 500 })
      }

      // STEP 4: Update balance with optimistic locking (check updated_at hasn't changed)
      const { data: updateResult, error: updateError } = await adminSupabase
        .from("profiles")
        .update({
          [field]: newValue,
          updated_at: new Date().toISOString()
        })
        .eq("id", userId)
        .eq("updated_at", originalUpdatedAt) // Optimistic lock - fails if another update happened
        .select(`id, ${field}`)
        .single()

      if (updateError || !updateResult) {
        // Concurrent modification detected - the balance was changed by another operation
        log.error("Concurrent modification detected during balance adjustment", {
          operationId,
          userId,
          error: updateError
        })

        // Update audit log to reflect failure
        await adminSupabase
          .from("admin_audit_logs")
          .update({
            action: "balance_adjustment_failed",
            details: {
              operationId,
              type,
              balanceAction,
              amount,
              previousValue: currentValue,
              intendedNewValue: newValue,
              reason,
              failureReason: "Concurrent modification - balance was changed by another operation",
              profileVersionBefore: originalUpdatedAt
            }
          })
          .eq("id", auditLogId)

        return NextResponse.json({
          error: "Balance was modified by another operation. Please refresh and try again.",
          code: "CONCURRENT_MODIFICATION"
        }, { status: 409 })
      }

      // STEP 5: Verify the update was applied correctly
      const actualNewValue = Number(updateResult[field])
      if (actualNewValue !== newValue) {
        log.error("Balance verification failed after update", {
          operationId,
          expected: newValue,
          actual: actualNewValue
        })

        // CRITICAL: Attempt to rollback
        await adminSupabase
          .from("profiles")
          .update({ [field]: currentValue })
          .eq("id", userId)

        await adminSupabase
          .from("admin_audit_logs")
          .update({
            action: "balance_adjustment_rollback",
            details: {
              operationId,
              type,
              balanceAction,
              amount,
              previousValue: currentValue,
              intendedNewValue: newValue,
              actualNewValue,
              reason,
              rollbackAttempted: true
            }
          })
          .eq("id", auditLogId)

        return NextResponse.json({
          error: "Balance verification failed. Operation rolled back.",
          code: "VERIFICATION_FAILED"
        }, { status: 500 })
      }

      // STEP 6: Update audit log to confirm success
      await adminSupabase
        .from("admin_audit_logs")
        .update({
          action: "balance_adjustment_completed",
          details: {
            operationId,
            type,
            balanceAction,
            amount,
            previousValue: currentValue,
            newValue: actualNewValue,
            verified: true,
            reason
          }
        })
        .eq("id", auditLogId)

      // STEP 7: Create transaction record if satoshis (for user-visible history)
      if (type === "satoshis") {
        await adminSupabase.from("transactions").insert({
          user_id: userId,
          type: "admin_adjustment",
          amount: balanceAction === "subtract" ? -amount : (balanceAction === "set" ? newValue - currentValue : amount),
          status: "completed",
          description: `Admin adjustment: ${reason}`,
          metadata: {
            admin_id: authResult.user.id,
            reason,
            operation_id: operationId,
            audit_log_id: auditLogId
          }
        })
      }

      // STEP 8: Create notification for user
      await adminSupabase.from("notifications").insert({
        user_id: userId,
        type: "balance_adjusted",
        title: "Balance Adjusted",
        message: `Your ${type === "satoshis" ? "satoshi" : "advertising"} balance has been adjusted by an administrator. New balance: ${type === "satoshis" ? actualNewValue.toLocaleString() + " sats" : "$" + actualNewValue.toFixed(2)}`,
        data: {
          type,
          previousValue: currentValue,
          newValue: actualNewValue,
          reason
        }
      })

      log.info("Admin balance adjustment completed successfully", {
        operationId,
        adminId: authResult.user.id,
        targetUserId: userId,
        type,
        action: balanceAction,
        amount,
        previousValue: currentValue,
        newValue: actualNewValue,
        auditLogId
      })

      return NextResponse.json({
        success: true,
        operationId,
        previousValue: currentValue,
        newValue: actualNewValue,
        message: `${type === "satoshis" ? "Satoshi" : "Advertising"} balance updated successfully`
      })
    }

    // =========================================================================
    // BOOSTER ACTIVATION - Grant booster to user
    // =========================================================================
    if (action === "activate_booster") {
      const validated = activateBoosterSchema.safeParse(body)
      if (!validated.success) {
        return NextResponse.json({
          error: "Invalid request",
          details: validated.error.issues.map(i => i.message)
        }, { status: 400 })
      }

      const { userId, boosterTierId, durationDays, reason } = validated.data

      // Get booster tier details
      const { data: tier } = await adminSupabase
        .from("booster_tiers")
        .select("*")
        .eq("id", boosterTierId)
        .single()

      if (!tier) {
        return NextResponse.json({ error: "Booster tier not found" }, { status: 404 })
      }

      // Verify target user exists
      const { data: targetUser } = await adminSupabase
        .from("profiles")
        .select("id, username")
        .eq("id", userId)
        .single()

      if (!targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }

      // Deactivate existing active boosters
      await adminSupabase
        .from("user_boosters")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("is_active", true)

      // Calculate expiry
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + (durationDays || tier.duration_days))

      // Create new booster
      const boosterId = uuidv4()
      await adminSupabase.from("user_boosters").insert({
        id: boosterId,
        user_id: userId,
        booster_tier_id: boosterTierId,
        expires_at: expiresAt.toISOString(),
        is_active: true,
        payment_method: "admin_granted",
        payment_reference: `admin_${authResult.user.id}_${operationId}`,
        amount_paid_usd: 0,
        amount_paid_satoshis: 0
      })

      // Log the action
      await adminSupabase.from("admin_audit_logs").insert({
        admin_id: authResult.user.id,
        action: "booster_granted",
        target_user_id: userId,
        details: {
          operationId,
          boosterId,
          boosterTierId,
          tierName: tier.name,
          durationDays: durationDays || tier.duration_days,
          expiresAt: expiresAt.toISOString(),
          reason
        }
      })

      // Notify user
      await adminSupabase.from("notifications").insert({
        user_id: userId,
        type: "booster_activated",
        title: "Booster Activated!",
        message: `You have been granted a ${tier.name} booster by admin. It will expire on ${expiresAt.toLocaleDateString()}.`,
        data: { booster_tier: tier.name, expires_at: expiresAt.toISOString(), granted_by_admin: true }
      })

      log.info("Admin activated booster", {
        operationId,
        adminId: authResult.user.id,
        targetUserId: userId,
        boosterTier: tier.name,
        expiresAt: expiresAt.toISOString()
      })

      return NextResponse.json({
        success: true,
        operationId,
        message: `${tier.name} booster activated for user`,
        expiresAt: expiresAt.toISOString()
      })
    }

    // =========================================================================
    // APPROVE MANUAL CRYPTO PAYMENT
    // =========================================================================
    if (action === "approve_payment") {
      const validated = paymentActionSchema.safeParse(body)
      if (!validated.success) {
        return NextResponse.json({
          error: "Invalid request",
          details: validated.error.issues.map(i => i.message)
        }, { status: 400 })
      }

      const { purchaseId, transactionHash } = validated.data

      // Get the purchase with lock-like behavior (check status before update)
      const { data: purchase, error: purchaseError } = await adminSupabase
        .from("booster_purchases")
        .select("*, booster_tiers(*)")
        .eq("id", purchaseId)
        .eq("payment_status", "pending")
        .single()

      if (purchaseError || !purchase) {
        log.warn("Pending purchase not found for approval", { operationId, purchaseId })
        return NextResponse.json({ error: "Pending purchase not found or already processed" }, { status: 404 })
      }

      const tierData = purchase.booster_tiers as any

      // Mark purchase as completed (atomically with status check)
      const { data: updatedPurchase, error: updatePurchaseError } = await adminSupabase
        .from("booster_purchases")
        .update({
          payment_status: "completed",
          transaction_hash: transactionHash || `admin_approved_${operationId}`,
          completed_at: new Date().toISOString()
        })
        .eq("id", purchaseId)
        .eq("payment_status", "pending") // Double-check status hasn't changed
        .select()
        .single()

      if (updatePurchaseError || !updatedPurchase) {
        log.error("Failed to update purchase status - concurrent modification", { operationId, purchaseId })
        return NextResponse.json({
          error: "Purchase status was modified by another operation. Please refresh."
        }, { status: 409 })
      }

      // Deactivate existing active boosters
      await adminSupabase
        .from("user_boosters")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("user_id", purchase.user_id)
        .eq("is_active", true)

      // Calculate expiry
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + (tierData?.duration_days || 7))

      // Create new booster
      await adminSupabase.from("user_boosters").insert({
        user_id: purchase.user_id,
        booster_tier_id: purchase.booster_tier_id,
        expires_at: expiresAt.toISOString(),
        is_active: true,
        payment_method: purchase.payment_method,
        payment_reference: purchase.payment_reference,
        amount_paid_usd: purchase.amount_usd,
        amount_paid_satoshis: purchase.amount_satoshis
      })

      // Audit log
      await adminSupabase.from("admin_audit_logs").insert({
        admin_id: authResult.user.id,
        action: "payment_approved",
        target_user_id: purchase.user_id,
        details: {
          operationId,
          purchaseId,
          boosterTier: tierData?.name,
          amountUsd: purchase.amount_usd,
          transactionHash: transactionHash || `admin_approved_${operationId}`
        }
      })

      // Notify user
      await adminSupabase.from("notifications").insert({
        user_id: purchase.user_id,
        type: "booster_activated",
        title: "Payment Confirmed - Booster Activated!",
        message: `Your payment has been confirmed. Your ${tierData?.name || "Booster"} is now active until ${expiresAt.toLocaleDateString()}.`,
        data: { booster_tier: tierData?.name, expires_at: expiresAt.toISOString() }
      })

      log.info("Admin approved payment", {
        operationId,
        adminId: authResult.user.id,
        purchaseId,
        userId: purchase.user_id,
        boosterTier: tierData?.name
      })

      return NextResponse.json({
        success: true,
        operationId,
        message: "Payment approved and booster activated"
      })
    }

    // =========================================================================
    // REJECT MANUAL CRYPTO PAYMENT
    // =========================================================================
    if (action === "reject_payment") {
      const validated = paymentActionSchema.safeParse(body)
      if (!validated.success) {
        return NextResponse.json({
          error: "Invalid request",
          details: validated.error.issues.map(i => i.message)
        }, { status: 400 })
      }

      const { purchaseId, reason: rejectReason } = validated.data

      // Get the purchase
      const { data: purchase, error: purchaseError } = await adminSupabase
        .from("booster_purchases")
        .select("*, booster_tiers(name)")
        .eq("id", purchaseId)
        .eq("payment_status", "pending")
        .single()

      if (purchaseError || !purchase) {
        return NextResponse.json({ error: "Pending purchase not found or already processed" }, { status: 404 })
      }

      // Mark purchase as failed (with status check)
      const { error: updateError } = await adminSupabase
        .from("booster_purchases")
        .update({
          payment_status: "failed",
          completed_at: new Date().toISOString()
        })
        .eq("id", purchaseId)
        .eq("payment_status", "pending")

      if (updateError) {
        return NextResponse.json({ error: "Failed to update purchase status" }, { status: 500 })
      }

      // Audit log
      await adminSupabase.from("admin_audit_logs").insert({
        admin_id: authResult.user.id,
        action: "payment_rejected",
        target_user_id: purchase.user_id,
        details: {
          operationId,
          purchaseId,
          boosterTier: (purchase.booster_tiers as any)?.name,
          reason: rejectReason
        }
      })

      // Notify user
      await adminSupabase.from("notifications").insert({
        user_id: purchase.user_id,
        type: "payment_rejected",
        title: "Payment Not Confirmed",
        message: `Your booster purchase payment could not be verified. ${rejectReason ? `Reason: ${rejectReason}` : "Please contact support if you believe this is an error."}`,
        data: { purchaseId, reason: rejectReason }
      })

      log.info("Admin rejected payment", {
        operationId,
        adminId: authResult.user.id,
        purchaseId,
        reason: rejectReason
      })

      return NextResponse.json({
        success: true,
        operationId,
        message: "Payment rejected"
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    log.error("Admin funds POST error", { operationId, error })
    return NextResponse.json({
      error: "Internal server error. Operation has been logged for review.",
      operationId
    }, { status: 500 })
  }
}
