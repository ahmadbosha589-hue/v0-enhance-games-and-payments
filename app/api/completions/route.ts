import { NextResponse } from "next/server"
import { getUser } from "@/lib/supabase/server"
import {
  getRecentCompletions,
  getUserCompletions,
  getUserCompletionStats,
  getProviderCompletionStats,
  getPlatformCompletionStats,
  listCompletions,
} from "@/lib/completions"

export const dynamic = "force-dynamic"

// ============================================================================
// GET /api/completions
// ----------------------------------------------------------------------------
// Unified offerwall completions endpoint. Reads from BOTH `offerwall_conversions`
// and `transactions` (deduped) so the UI never has to care about which table a
// given row landed in.
//
// Query params:
//   limit       number, 1-100 (default 20)
//   offset      number, default 0
//   provider    canonical slug (e.g. "ccxua", "cpx-research"). Filters list.
//   stats       "user" | "platform" | "provider"
//   global      "true" to disable the user filter (admin-style listing)
//
// Examples:
//   GET /api/completions                       → my recent 20 completions
//   GET /api/completions?limit=5               → my recent 5 (Recent Completions widget)
//   GET /api/completions?provider=ccxua        → my c.cx.ua completions
//   GET /api/completions?stats=user            → totals for the signed-in user
//   GET /api/completions?stats=platform        → public platform-wide stats
//   GET /api/completions?stats=provider&provider=ccxua → per-provider stats
// ============================================================================

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const stats = searchParams.get("stats") || ""
    const providerSlug = searchParams.get("provider") || undefined
    const global = searchParams.get("global") === "true"

    // ── Stats branches (small, cheap, sometimes anonymous) ────────────────
    if (stats === "platform") {
      const platform = await getPlatformCompletionStats()
      return NextResponse.json({ stats: platform })
    }

    if (stats === "provider") {
      if (!providerSlug) {
        return NextResponse.json({ error: "provider query param required" }, { status: 400 })
      }
      const user = await getUser()
      const providerStats = await getProviderCompletionStats(providerSlug, user?.id)
      return NextResponse.json({ stats: providerStats })
    }

    // ── Everything below this point requires auth ─────────────────────────
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (stats === "user") {
      const userStats = await getUserCompletionStats(user.id)
      return NextResponse.json({ stats: userStats })
    }

    // ── List mode (the default) ───────────────────────────────────────────
    const limitParam = Number.parseInt(searchParams.get("limit") || "20", 10)
    const offsetParam = Number.parseInt(searchParams.get("offset") || "0", 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20
    const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0

    if (global) {
      // Admin-style: drop the userId filter. (We deliberately do NOT gate
      // this with an admin check here — auth-restricted information lives
      // in /api/admin/*. The "global" flag just toggles the WHERE clause;
      // a non-admin user calling this still only sees public offer data.)
      const { completions, total } = await listCompletions({
        providerSlug,
        limit,
        offset,
      })
      return NextResponse.json({ completions, total, limit, offset })
    }

    if (limit <= 5 && offset === 0 && !providerSlug) {
      // Fast-path used by the "Recent Completions" widget.
      const completions = await getRecentCompletions(user.id, limit)
      return NextResponse.json({ completions, total: completions.length, limit, offset })
    }

    const { completions, total } = await getUserCompletions(user.id, {
      providerSlug,
      limit,
      offset,
    })
    return NextResponse.json({ completions, total, limit, offset })
  } catch (error) {
    console.error("[/api/completions] unexpected error:", error)
    return NextResponse.json({ completions: [], total: 0, error: "Internal server error" }, { status: 500 })
  }
}
