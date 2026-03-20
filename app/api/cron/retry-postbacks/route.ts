import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { log } from "@/lib/logger"

// Cron: retry offerwall conversions where the balance update failed.
// These are records with status="pending" and metadata.balance_update_failed=true.
// Add to vercel.json:
//   { "path": "/api/cron/retry-postbacks", "schedule": "*/10 * * * *" }

const MAX_RETRIES = 3
const BATCH_SIZE = 20

export async function GET(request: Request) {
  const startTime = Date.now()

  try {
    // Verify cron secret
    const headersList = await headers()
    const authHeader = headersList.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const db = createAdminClient()

    // Find pending conversions with failed balance updates
    // These were created but balance wasn't credited due to a DB race/error
    const { data: pending, error: fetchError } = await db
      .from("offerwall_conversions")
      .select("id, user_id, payout_satoshis, transaction_id, provider_id, offer_name, metadata")
      .eq("status", "pending")
      .limit(BATCH_SIZE)
      .order("created_at", { ascending: true }) // oldest first

    if (fetchError) {
      log.error("[RetryPostbacks] Failed to fetch pending conversions", { error: fetchError })
      return NextResponse.json({ error: "DB fetch failed" }, { status: 500 })
    }

    if (!pending || pending.length === 0) {
      return NextResponse.json({ success: true, message: "No pending conversions to retry", processed: 0 })
    }

    let succeeded = 0
    let failed = 0
    let skipped = 0
    const results: Array<{ id: string; result: string; reason?: string }> = []

    for (const conversion of pending) {
      const meta = (conversion.metadata as Record<string, unknown>) || {}
      const retryCount = (meta.retry_count as number) || 0

      // Skip if exceeded max retries — mark as permanently failed
      if (retryCount >= MAX_RETRIES) {
        await db
          .from("offerwall_conversions")
          .update({
            status: "failed",
            metadata: { ...meta, permanently_failed: true, failed_at: new Date().toISOString() },
          })
          .eq("id", conversion.id)

        log.warn("[RetryPostbacks] Conversion exceeded max retries, marking failed", {
          id: conversion.id,
          userId: conversion.user_id,
          amount: conversion.payout_satoshis,
          retries: retryCount,
        })
        skipped++
        results.push({ id: conversion.id, result: "max_retries_exceeded" })
        continue
      }

      // Attempt to credit the user's balance atomically
      const { data: profile, error: profileErr } = await db
        .from("profiles")
        .select("balance_satoshis, total_earned_satoshis")
        .eq("id", conversion.user_id)
        .single()

      if (profileErr || !profile) {
        log.error("[RetryPostbacks] Could not fetch profile", { id: conversion.id, userId: conversion.user_id })
        await db.from("offerwall_conversions").update({
          metadata: { ...meta, retry_count: retryCount + 1, last_retry: new Date().toISOString(), last_error: "profile_not_found" },
        }).eq("id", conversion.id)
        failed++
        results.push({ id: conversion.id, result: "failed", reason: "profile_not_found" })
        continue
      }

      const newBalance = profile.balance_satoshis + conversion.payout_satoshis
      const newTotalEarned = (profile.total_earned_satoshis || 0) + conversion.payout_satoshis

      // Update balance with optimistic concurrency (checks current balance before updating)
      const { error: balanceErr } = await db
        .from("profiles")
        .update({
          balance_satoshis: newBalance,
          total_earned_satoshis: newTotalEarned,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversion.user_id)
        .eq("balance_satoshis", profile.balance_satoshis) // optimistic lock

      if (balanceErr) {
        log.error("[RetryPostbacks] Balance update failed again", { id: conversion.id, error: balanceErr })
        await db.from("offerwall_conversions").update({
          metadata: { ...meta, retry_count: retryCount + 1, last_retry: new Date().toISOString(), last_error: balanceErr.message },
        }).eq("id", conversion.id)
        failed++
        results.push({ id: conversion.id, result: "failed", reason: balanceErr.message })
        continue
      }

      // Mark conversion as approved
      await db
        .from("offerwall_conversions")
        .update({
          status: "approved",
          processed_at: new Date().toISOString(),
          metadata: { ...meta, retry_count: retryCount + 1, resolved_at: new Date().toISOString(), balance_update_failed: false },
        })
        .eq("id", conversion.id)

      // Create transaction record
      await db.from("transactions").insert({
        user_id: conversion.user_id,
        type: "offerwall",
        amount_satoshis: conversion.payout_satoshis,
        balance_before: profile.balance_satoshis,
        balance_after: newBalance,
        status: "completed",
        description: `${conversion.offer_name} (retry)`,
        metadata: { conversion_id: conversion.id, retried: true },
      }).catch(() => { /* non-critical */ })

      // Notify user
      await db.from("notifications").insert({
        user_id: conversion.user_id,
        type: "offerwall_credit",
        title: "Offerwall Reward Credited",
        message: `You earned ${conversion.payout_satoshis} satoshis from ${conversion.offer_name}`,
        metadata: { amount: conversion.payout_satoshis, conversion_id: conversion.id },
      }).catch(() => { /* non-critical */ })

      log.info("[RetryPostbacks] Successfully retried conversion", {
        id: conversion.id,
        userId: conversion.user_id,
        amount: conversion.payout_satoshis,
        retryCount: retryCount + 1,
      })

      succeeded++
      results.push({ id: conversion.id, result: "success" })
    }

    const elapsed = Date.now() - startTime
    log.info("[RetryPostbacks] Batch complete", { succeeded, failed, skipped, elapsed })

    return NextResponse.json({
      success: true,
      processed: pending.length,
      succeeded,
      failed,
      skipped,
      elapsed,
      results,
    })
  } catch (error) {
    log.error("[RetryPostbacks] Unexpected error", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
