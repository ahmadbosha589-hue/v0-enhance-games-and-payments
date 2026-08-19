import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { timingSafeEqual } from "node:crypto"
import { log } from "@/lib/logger"
import { runProcessWithdrawals } from "@/app/api/cron/process-withdrawals/route"
import { runRetryPostbacks } from "@/app/api/cron/retry-postbacks/route"
import { runCleanup } from "@/app/api/cron/cleanup/route"


export async function GET() {
  const headersList = await headers()
  const authHeader = headersList.get("authorization")
  const cronSecret = process.env.CRON_SECRET?.trim()

  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Cron endpoint is not configured" }, { status: 503 })
  }

  if (cronSecret) {
    const received = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : ""
    const receivedBytes = Buffer.from(received, "utf8")
    const expectedBytes = Buffer.from(cronSecret, "utf8")
    const valid = receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes)
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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