import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { log } from "@/lib/logger"

// =============================================================================
// PERSISTENT ADBLOCK STATUS ENDPOINT (v13.0)
// =============================================================================
//
// Returns the user's persisted adblock flag from the `profiles` table so
// the client-side provider can immediately restore the flagged state on
// page load, tab open, route change, or browser restart. This is the
// authoritative source of truth — once a user is flagged server-side, the
// flag survives across sessions, devices, and browser data clears until
// resolved through the appeal workflow.
//
// Designed to be cheap and cacheable per-request:
//   - returns 401 quickly for unauthenticated callers
//   - single SELECT against the profiles table
//   - no fraud_flags join (kept lean — separate endpoint can fetch detail)
// =============================================================================

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Read persisted state via admin client (bypasses RLS for this self-lookup)
    const admin = createAdminClient()
    const { data: profile, error } = await admin
      .from("profiles")
      .select(
        "adblock_detected_at, adblock_confidence, adblock_blocker_type, adblock_detection_methods, adblock_server_verified, adblock_verification_score",
      )
      .eq("id", user.id)
      .maybeSingle()

    if (error) {
      log.warn("Adblock status lookup failed", { userId: user.id, error: error.message })
      // Fail open — don't block legitimate users on a DB hiccup
      return NextResponse.json({
        isFlagged: false,
        persisted: false,
      })
    }

    // Also check for an active fraud_flags row (most-up-to-date source)
    const { data: flag } = await admin
      .from("fraud_flags")
      .select("severity, status, details, created_at")
      .eq("user_id", user.id)
      .eq("flag_type", "adblock")
      .in("status", ["pending", "confirmed", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const isFlagged =
      !!profile?.adblock_detected_at ||
      (!!flag && flag.status !== "rejected" && flag.status !== "resolved")

    if (!isFlagged) {
      return NextResponse.json({
        isFlagged: false,
        persisted: false,
      })
    }

    return NextResponse.json({
      isFlagged: true,
      persisted: true,
      detectedAt: profile?.adblock_detected_at || flag?.created_at || null,
      confidence: profile?.adblock_confidence ?? 100,
      blockerType: profile?.adblock_blocker_type ?? null,
      methods: profile?.adblock_detection_methods ?? [],
      serverVerified: profile?.adblock_server_verified ?? true,
      verificationScore: profile?.adblock_verification_score ?? 0,
      flagSeverity: flag?.severity ?? null,
      flagStatus: flag?.status ?? null,
    })
  } catch (error) {
    log.error("Adblock status endpoint error", { error })
    // Fail open
    return NextResponse.json({ isFlagged: false, persisted: false })
  }
}
