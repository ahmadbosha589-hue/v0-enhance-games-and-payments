import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { verifyTOTPWithStep, verifyBackupCode } from "@/lib/2fa/totp"
import { log, toError } from "@/lib/logger"

export const runtime = "nodejs"
export const maxDuration = 8

/**
 * Validate a 2FA challenge during the login flow.
 *
 * SECURITY (S6). This endpoint is necessarily reachable before a full session
 * exists, which is exactly what made the original version dangerous:
 *
 *   - It accepted `userId` straight from the request body with no proof the
 *     caller owned that account, and applied NO rate limiting. Combined with
 *     /api/leaderboard leaking user ids and /api/2fa/status returning `userId`
 *     for any email, that was an unlimited 6-digit brute-force oracle: ~1e6
 *     guesses against a known id, no lockout, no logging.
 *   - A malformed code crashed it (crypto.timingSafeEqual throws on length
 *     mismatch), so probing also produced 500s with stack traces.
 *   - A valid code could be replayed for its whole ±30s window.
 *
 * Mitigations here:
 *   1. Attempts are counted per (user, IP) and per IP, and locked out. State
 *      lives in the DB via consume_2fa_attempt(), so it is shared across
 *      serverless instances (an in-process Map resets on every cold start and
 *      is per-instance — i.e. no limit at all in practice).
 *   2. Codes are format-validated before any comparison.
 *   3. An accepted TOTP time-step is persisted and refused on reuse, so a
 *      sniffed code cannot be replayed inside its validity window.
 *   4. Failures are logged for alerting, and the response is uniform so it
 *      cannot be used to enumerate which accounts have 2FA.
 */

const MAX_ATTEMPTS_PER_USER = 5
const ATTEMPT_WINDOW_SECONDS = 900 // 15 minutes

function clientIp(h: Headers): string {
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  )
}

/** Uniform failure so the caller cannot distinguish the reason. */
function invalid() {
  return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 })
}

export async function POST(request: Request) {
  try {
    const db = requireAdminClient()
    const h = await headers()
    const ip = clientIp(h)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") return invalid()

    const { userId, code, useBackupCode } = body as {
      userId?: unknown
      code?: unknown
      useBackupCode?: unknown
    }

    // Shape validation BEFORE any DB or crypto work.
    if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) return invalid()
    if (typeof code !== "string" || code.length === 0 || code.length > 64) return invalid()

    const isBackup = useBackupCode === true
    if (!isBackup && !/^\d{6}$/.test(code)) {
      // Not even a possible TOTP — count it as an attempt so probing is bounded.
      await db.rpc("consume_2fa_attempt", {
        p_user_id: userId,
        p_ip: ip,
        p_max_attempts: MAX_ATTEMPTS_PER_USER,
        p_window_seconds: ATTEMPT_WINDOW_SECONDS,
      })
      return invalid()
    }

    // Rate limit / lockout. Returns false once the budget is exhausted.
    const { data: allowed, error: rlError } = await db.rpc("consume_2fa_attempt", {
      p_user_id: userId,
      p_ip: ip,
      p_max_attempts: MAX_ATTEMPTS_PER_USER,
      p_window_seconds: ATTEMPT_WINDOW_SECONDS,
    })

    if (rlError) {
      // Fail CLOSED: without a working limiter this endpoint is a brute-force
      // oracle, so we would rather reject than serve unbounded attempts.
      log.error("2FA attempt limiter unavailable", toError(rlError.message))
      return NextResponse.json(
        { error: "Service temporarily unavailable" },
        { status: 503, headers: { "Retry-After": "30" } },
      )
    }

    if (allowed === false) {
      log.warn("2FA lockout triggered", { userId, ip })
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(ATTEMPT_WINDOW_SECONDS) } },
      )
    }

    const { data: profile } = await db
      .from("profiles")
      .select(
        "two_factor_secret, two_factor_enabled, two_factor_backup_codes, two_factor_last_step",
      )
      .eq("id", userId)
      .single()

    // Uniform response whether the user is absent or simply has no 2FA — this
    // used to return a distinct "2FA not enabled for this user" message, which
    // confirmed account existence to an unauthenticated caller.
    if (!profile?.two_factor_enabled || !profile.two_factor_secret) return invalid()

    if (isBackup) {
      const { valid, index } = verifyBackupCode(
        code,
        (profile.two_factor_backup_codes as string[] | null) || [],
      )
      if (!valid) {
        log.warn("2FA backup code rejected", { userId, ip })
        return invalid()
      }

      // Single-use: remove the redeemed code.
      const remaining = [...((profile.two_factor_backup_codes as string[]) || [])]
      remaining.splice(index, 1)
      await db
        .from("profiles")
        .update({ two_factor_backup_codes: remaining })
        .eq("id", userId)

      await db.rpc("reset_2fa_attempts", { p_user_id: userId, p_ip: ip })

      return NextResponse.json({
        success: true,
        remainingBackupCodes: remaining.length,
      })
    }

    const { valid, step } = verifyTOTPWithStep(profile.two_factor_secret as string, code)
    if (!valid || step === null) {
      log.warn("2FA TOTP rejected", { userId, ip })
      return invalid()
    }

    // Replay guard: a TOTP is valid for a ±1 step window, so the same code could
    // previously be submitted repeatedly (e.g. by an attacker who observed it).
    // Refuse any step at or below the last accepted one.
    const lastStep = Number(profile.two_factor_last_step ?? 0)
    if (Number.isFinite(lastStep) && step <= lastStep) {
      log.warn("2FA code replay blocked", { userId, ip, step, lastStep })
      return invalid()
    }

    await db.from("profiles").update({ two_factor_last_step: step }).eq("id", userId)
    await db.rpc("reset_2fa_attempts", { p_user_id: userId, p_ip: ip })

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error("2FA validation error", toError(error))
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
