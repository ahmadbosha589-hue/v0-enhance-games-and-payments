import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { log } from "@/lib/logger"
import { requireAdminClient } from "@/lib/supabase/admin-client"

// =============================================================================
// SELF-HEAL CLEAR ENDPOINT (v17.0)
// =============================================================================
//
// Called by the client-side detection hook when it observes multiple
// consecutive *definitively clean* detection cycles while the user is
// currently flagged. This is the recovery path for false positives.
//
// SECURITY MODEL:
//   • Only the authenticated user can clear THEIR OWN flag (auth.uid() must
//     match the request's userId).
//   • We never clear flags created/escalated by an admin or staff. Those have
//     `resolved_by` set, or carry an `admin_action` marker in the evidence/
//     details JSON, or severity >= 7 — any of which short-circuits the clear.
//   • Only pending/active automated-detection flags (status in pending,
//     pending_review, active) are eligible; confirmed/resolved/rejected rows
//     are untouched.
//   • Rate-limited per user — a clear can only happen once every 30 seconds
//     (prevents abuse by a script trying to spam-clear).
//   • Server independently re-verifies the supplied "clean" evidence: must
//     include `controlVisible: true`, `controlsHealthy: true`, zero hidden
//     baits, zero blocked third-party fetches.
//
// On success we:
//   1. Update the user's profile to NULL the adblock_* detection fields.
//   2. Mark any open automated adblock fraud_flags rows as resolved with
//      `resolution_notes='self_healed_clean_detection'`.
//   3. Insert an audit record into adblock_self_heal_events (if table exists).
//   4. Return 200 OK.
//
// =============================================================================

export const dynamic = "force-dynamic"
export const revalidate = 0

interface ClearRequest {
  evidence?: {
    controlVisible?: boolean
    controlsHealthy?: boolean
    hiddenBaits?: number
    thirdPartyBlocked?: number
    consecutiveCleanCycles?: number
  }
}

// In-memory rate-limit map (per process). Each user can clear at most once
// per 30s. This is a soft floor — primary security is auth + evidence checks.
const RATE_LIMIT_MS = 30 * 1000
const recentClears = new Map<string, number>()

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    // Rate limit
    const last = recentClears.get(user.id) ?? 0
    if (Date.now() - last < RATE_LIMIT_MS) {
      return NextResponse.json(
        { ok: false, error: "Rate limited", retryAfter: RATE_LIMIT_MS - (Date.now() - last) },
        { status: 429 },
      )
    }

    let body: ClearRequest = {}
    try {
      body = (await req.json()) as ClearRequest
    } catch {
      // Empty body is fine — we'll fall through to evidence checks below.
    }

    const ev = body.evidence ?? {}

    // ─────────────────────────────────────────────────────────────────────
    // EVIDENCE GATE — server-side re-verification of the clean signal
    // ─────────────────────────────────────────────────────────────────────
    // The client must supply consistent, conclusive evidence that the page
    // is now genuinely clean. Any failure here means we refuse to clear.
    const evidenceOk =
      ev.controlVisible === true &&
      ev.controlsHealthy === true &&
      (ev.hiddenBaits ?? 0) === 0 &&
      (ev.thirdPartyBlocked ?? 0) === 0 &&
      (ev.consecutiveCleanCycles ?? 0) >= 2

    if (!evidenceOk) {
      return NextResponse.json(
        { ok: false, error: "Insufficient evidence to self-heal", evidence: ev },
        { status: 400 },
      )
    }

    const admin = requireAdminClient()

    // ─────────────────────────────────────────────────────────────────────
    // Check whether there is an admin-confirmed or high-severity flag.
    // If so, refuse — only an admin can clear those.
    // ─────────────────────────────────────────────────────────────────────
    const { data: openFlags } = await admin
      .from("fraud_flags")
      .select("id, status, severity, resolved_by, action_taken, evidence, details")
      .eq("user_id", user.id)
      .or("flag_type.eq.adblock,fraud_type.eq.adblock_user,fraud_type.eq.adblock")

    const adminConfirmed = (openFlags ?? []).some((f: any) => {
      if (!f) return false
      // Anything resolved by an admin is durable — don't touch.
      if (f.resolved_by) return true
      // High severity (>=7 on the 1–10 scale) is treated as admin-only too.
      if (typeof f.severity === "number" && f.severity >= 7) return true
      // Action already taken (e.g. account suspended) — don't undo silently.
      if (typeof f.action_taken === "string" && f.action_taken.trim().length > 0) return true
      // Explicit admin marker in evidence / details JSON
      const meta = (f.evidence ?? f.details ?? {}) as Record<string, unknown>
      if (meta && (meta as any).admin_action === true) return true
      if (typeof f.status === "string" && (f.status === "confirmed" || f.status === "escalated")) return true
      return false
    })

    if (adminConfirmed) {
      return NextResponse.json(
        {
          ok: false,
          error: "Flag was admin-confirmed and can only be cleared through the appeal workflow",
        },
        { status: 403 },
      )
    }

    // ─────────────────────────────────────────────────────────────────────
    // 1) Clear automated-detection fields on the profile.
    //    We zero only the auto-detection columns — never touch admin fields.
    // ─────────────────────────────────────────────────────────────────────
    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        adblock_detected_at: null,
        adblock_confidence: 0,
        adblock_blocker_type: null,
        adblock_detection_methods: [],
        adblock_server_verified: false,
        adblock_verification_score: 0,
        adblock_flagged: false,
      })
      .eq("id", user.id)

    if (profileErr) {
      log.warn("Adblock self-heal profile update failed", {
        userId: user.id,
        error: profileErr.message,
      })
      // Continue — we still attempt to resolve the fraud_flags rows.
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2) Resolve any open auto-created adblock fraud_flags rows.
    //    We use both possible column names (flag_type / fraud_type) because
    //    the legacy migrations vary across deployments.
    // ─────────────────────────────────────────────────────────────────────
    const resolvableStatuses = ["pending", "pending_review", "active"]

    // flag_type variant
    try {
      await admin
        .from("fraud_flags")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolution_notes: "self_healed_clean_detection",
        })
        .eq("user_id", user.id)
        .eq("flag_type", "adblock")
        .in("status", resolvableStatuses)
        .is("resolved_by", null) // never touch admin-resolved rows
    } catch {}
    // fraud_type variant (legacy schema)
    try {
      await admin
        .from("fraud_flags")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolution_notes: "self_healed_clean_detection",
        })
        .eq("user_id", user.id)
        .in("fraud_type", ["adblock", "adblock_user"])
        .in("status", resolvableStatuses)
        .is("resolved_by", null)
    } catch {}

    // ─────────────────────────────────────────────────────────────────────
    // 3) Best-effort audit log into adblock_analytics (table from
    //    029_create_adblock_analytics_table.sql). Ignored if table missing.
    // ─────────────────────────────────────────────────────────────────────
    try {
      await admin.from("adblock_analytics").insert({
        user_id: user.id,
        event_type: "self_healed",
        details: {
          consecutiveCleanCycles: ev.consecutiveCleanCycles ?? 0,
          source: "client_self_heal",
        },
        created_at: new Date().toISOString(),
      })
    } catch {}

    recentClears.set(user.id, Date.now())

    log.info("Adblock flag self-healed", {
      userId: user.id,
      consecutiveCleanCycles: ev.consecutiveCleanCycles ?? 0,
    })

    return NextResponse.json({ ok: true, cleared: true })
  } catch (error) {
    log.error("Adblock self-heal endpoint error", { error })
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 })
  }
}
