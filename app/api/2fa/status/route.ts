import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { requireAdminClient } from "@/lib/supabase/admin-client"
import { log, toError } from "@/lib/logger"

export const runtime = "nodejs"
export const maxDuration = 8

/** Authenticated: report the caller's own 2FA state. */
export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("two_factor_enabled, two_factor_enabled_at, two_factor_backup_codes")
      .eq("id", user.id)
      .single()

    return NextResponse.json({
      enabled: profile?.two_factor_enabled || false,
      enabledAt: profile?.two_factor_enabled_at || null,
      backupCodesRemaining: profile?.two_factor_backup_codes?.length || 0,
    })
  } catch (error) {
    log.error("2FA status error", toError(error))
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * Unauthenticated pre-login probe: "will this email need a 2FA step?"
 *
 * SECURITY (S6). The original implementation had two serious problems:
 *
 *  1. It returned `userId` whenever 2FA was enabled. That handed an
 *     unauthenticated caller the exact account id needed to brute-force
 *     /api/2fa/validate (which itself had no rate limiting). The id is no
 *     longer returned under any circumstance — the login flow now carries the
 *     pending user in a signed HttpOnly cookie instead.
 *
 *  2. It called `supabase.auth.admin.listUsers()` — an UNPAGINATED fetch of
 *     every user in the project — then did a linear .find() over the result, on
 *     EVERY login attempt. That is O(users) work and multi-second latency on
 *     the login critical path. Replaced with the email_requires_2fa() RPC,
 *     which is a single indexed lookup (scripts/071_two_factor_hardening.sql).
 *
 * The response is deliberately uniform: unknown email, missing profile, and
 * "2FA off" all return `{ requires2FA: false }`, so this cannot be used to
 * enumerate registered accounts.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = (body as { email?: unknown } | null)?.email

    if (typeof email !== "string" || email.length < 3 || email.length > 320) {
      return NextResponse.json({ requires2FA: false })
    }

    const db = requireAdminClient()
    const { data, error } = await db.rpc("email_requires_2fa", {
      p_email: email.toLowerCase().trim(),
    })

    if (error) {
      const h = await headers()
      log.warn("2FA status lookup failed", {
        error: error.message,
        ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      })
      // Fail toward "no 2FA": the login flow then proceeds normally, and a user
      // who does have 2FA is still protected because /api/2fa/validate is the
      // component that actually enforces it.
      return NextResponse.json({ requires2FA: false })
    }

    // NOTE: no userId in the response — see the security note above.
    return NextResponse.json({ requires2FA: data === true })
  } catch (error) {
    log.error("2FA check error", toError(error))
    return NextResponse.json({ requires2FA: false })
  }
}
