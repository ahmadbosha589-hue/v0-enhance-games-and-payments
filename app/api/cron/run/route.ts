import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { log } from "@/lib/logger"
import { runProcessWithdrawals } from "@/app/api/cron/process-withdrawals/route"
import { runRetryPostbacks } from "@/app/api/cron/retry-postbacks/route"
import { runCleanup } from "@/app/api/cron/cleanup/route"

/**
 * Unified cron handler — single Vercel cron entry at */5 * * * *
 *
 * Schedule logic:
 * process - withdrawals  → every tick(*/5 min)
  * retry - postbacks      → every 10min(minutes % 10 === 0)
    * cleanup              → daily 3 AM(hour === 3 && minutes < 5)
      */
export async function GET() {
  const headersList = await headers()
  const authHeader = headersList.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const minutes = now.getUTCMinutes()
  const hours = now.getUTCHours()

  const ran: Record<string, unknown> = {}
  const errors: Record<string, string> = {}

  // ── Every 5 min (always) ─────────────────────────────────────────────────
  try {
    ran.processWithdrawals = await runProcessWithdrawals()
  } catch (e) {
    errors.processWithdrawals = e instanceof Error ? e.message : String(e)
    log.error("[cron/run] processWithdrawals failed", { error: e })
  }

  // ── Every 10 min (minutes divisible by 10) ───────────────────────────────
  if (minutes % 10 === 0) {
    try {
      ran.retryPostbacks = await runRetryPostbacks()
    } catch (e) {
      errors.retryPostbacks = e instanceof Error ? e.message : String(e)
      log.error("[cron/run] retryPostbacks failed", { error: e })
    }
  }

  // ── Daily at 3 AM UTC ────────────────────────────────────────────────────
  if (hours === 3 && minutes < 5) {
    try {
      ran.cleanup = await runCleanup()
    } catch (e) {
      errors.cleanup = e instanceof Error ? e.message : String(e)
      log.error("[cron/run] cleanup failed", { error: e })
    }
  }

  const hasErrors = Object.keys(errors).length > 0
  log.info("[cron/run] tick complete", { ran: Object.keys(ran), errors, at: now.toISOString() })

  return NextResponse.json(
    {
      success: !hasErrors,
      at: now.toISOString(),
      ran,
      ...(hasErrors && { errors }),
    },
    { status: hasErrors ? 207 : 200 }
  )
}