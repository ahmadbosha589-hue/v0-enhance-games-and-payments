import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { log } from "@/lib/logger"

// Daily cleanup job - run at 3 AM UTC
// Add to vercel.json: { "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }] }

export async function GET() {
  const startTime = Date.now()

  try {
    const headersList = await headers()
    const authHeader = headersList.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()
    const results: Record<string, number> = {}

    // 1. Delete old read notifications (older than 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { count: deletedNotifications } = await supabase
      .from("notifications")
      .delete({ count: "exact" })
      .eq("is_read", true)
      .lt("created_at", thirtyDaysAgo)

    results.deletedNotifications = deletedNotifications || 0

    // 2. Delete old audit logs (older than 90 days, keep important ones)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { count: deletedAuditLogs } = await supabase
      .from("audit_logs")
      .delete({ count: "exact" })
      .lt("created_at", ninetyDaysAgo)
      .not("action", "in", '("ban_user","unban_user","withdrawal_processed")')

    results.deletedAuditLogs = deletedAuditLogs || 0

    // 3. Reset claim streaks for inactive users (no claim in 48 hours)
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { count: resetStreaks } = await supabase
      .from("profiles")
      .update({ claim_streak: 0 })
      .lt("last_claim_at", twoDaysAgo)
      .gt("claim_streak", 0)

    results.resetStreaks = resetStreaks || 0

    // 4. Clean up expired rate limit entries (if using database rate limiting)
    // This would be handled by Redis TTL in production

    // 5. Update last_active_at based on recent claims
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentClaimers } = await supabase.from("claims").select("user_id").gte("created_at", oneDayAgo)

    if (recentClaimers && recentClaimers.length > 0) {
      const uniqueUserIds = [...new Set(recentClaimers.map((c) => c.user_id))]
      await supabase.from("profiles").update({ last_active_at: new Date().toISOString() }).in("id", uniqueUserIds)

      results.updatedActiveUsers = uniqueUserIds.length
    }

    // 6. Auto-dismiss old low-severity fraud flags (older than 14 days)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const { count: dismissedFlags } = await supabase
      .from("fraud_flags")
      .update({
        status: "dismissed",
        resolved_at: new Date().toISOString(),
        notes: "Auto-dismissed by cleanup job",
      })
      .eq("status", "pending_review")
      .eq("severity", "low")
      .lt("created_at", twoWeeksAgo)

    results.dismissedFlags = dismissedFlags || 0

    const duration = Date.now() - startTime
    log.info("Cleanup cron completed", { ...results, duration })

    return NextResponse.json({
      success: true,
      ...results,
      duration,
    })
  } catch (error) {
    log.error("Cleanup cron error", { error })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
