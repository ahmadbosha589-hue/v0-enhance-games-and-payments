import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { timingSafeEqual } from "node:crypto"
import { log } from "@/lib/logger"
import { runProcessWithdrawals } from "@/app/api/cron/process-withdrawals/route"
import { runRetryPostbacks } from "@/app/api/cron/retry-postbacks/route"
import { runCleanup } from "@/app/api/cron/cleanup/route"
import { requireAdminClient } from "@/lib/supabase/admin-client"

/**
 * Finalize any tournaments whose end date has passed but which are still
 * active. finalize_tournament is idempotent (advisory lock + completed
 * short-circuit), so overlapping ticks are safe. Failures are logged and
 * surfaced in the response without blocking the other cron jobs.
 */
async function finalizeExpiredTournaments(): Promise<{ finalized: number; paid: number; distributed: number; errors: string[] }> {
  const out = { finalized: 0, paid: 0, distributed: 0, errors: [] as string[] }
  const admin = requireAdminClient()
  if (!admin) {
    out.errors.push("admin client unavailable")
    return out
  }

  try {
    const { data: expired, error } = await admin
      .from("tournaments")
      .select("id, name")
      .eq("status", "active")
      .lt("ends_at", new Date().toISOString())
      .limit(25)

    if (error) {
      out.errors.push(error.message)
      return out
    }
    if (!expired?.length) return out

    for (const t of expired) {
      const { data, error: rpcError } = await admin.rpc("finalize_tournament", { p_tournament_id: t.id })
      if (rpcError) {
        out.errors.push(`${t.id}: ${rpcError.message}`)
        log.error("[cron/run] tournament finalization failed", { tournamentId: t.id, error: rpcError })
        continue
      }
      const r = data as { success?: boolean; error?: string; already_completed?: boolean; winners_paid?: number; total_distributed?: number } | null
      if (r?.success) {
        out.finalized += 1
        out.paid += r.winners_paid ?? 0
        out.distributed += r.total_distributed ?? 0
        log.info("[cron/run] tournament finalized", {
          tournamentId: t.id,
          name: t.name,
          winnersPaid: r.winners_paid,
          totalDistributed: r.total_distributed,
          alreadyCompleted: r.already_completed,
        })
      } else {
        out.errors.push(`${t.id}: ${r?.error || "unknown error"}`)
      }
    }
  } catch (e) {
    out.errors.push(e instanceof Error ? e.message : String(e))
  }

  return out
}

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

    // Pay out tournaments whose period ended while no admin was watching.
    try {
      ran.finalizeTournaments = await finalizeExpiredTournaments()
    } catch (e) {
      errors.finalizeTournaments = e instanceof Error ? e.message : String(e)
      log.error("[cron/run] finalizeTournaments failed", { error: e })
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